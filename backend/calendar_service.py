"""
calendar_service
─────────────────────────────────────────────────────────────────────────────
Upcoming dividends and earnings for the user's currently-held tickers.

Uses yfinance's:
  • Ticker.info['exDividendDate']  (next ex-dividend date)
  • Ticker.dividends                (historical, used to estimate next payment $)
  • Ticker.calendar                 (earnings date, EPS estimate)

Aggressively cached (12h TTL) since these fields change rarely and yfinance
is rate-limit sensitive from Cloud Functions. Falls back gracefully when a
ticker has no data.
"""

from __future__ import annotations
import logging
import time
from datetime import datetime, date, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed


_calendar_cache: dict = {}  # ticker → (timestamp, {'dividend':..., 'earnings':...})
CALENDAR_TTL_SECONDS = 12 * 3600


def _fetch_ticker_calendar(ticker_symbol: str) -> dict:
    """Pull dividend + earnings data for one ticker. Cached for 12h."""
    cached = _calendar_cache.get(ticker_symbol)
    if cached:
        ts, data = cached
        if time.time() - ts < CALENDAR_TTL_SECONDS:
            return data

    import yfinance as yf
    out = {'dividend': None, 'earnings': None}
    try:
        ticker = yf.Ticker(ticker_symbol)

        # Dividend info
        try:
            info = ticker.info or {}
            ex_div_ts = info.get('exDividendDate')
            if ex_div_ts:
                # yfinance returns UNIX timestamp; convert to date
                ex_div_date = datetime.utcfromtimestamp(ex_div_ts).date()
                # Only surface if it's in the future
                if ex_div_date >= date.today():
                    # Estimate per-share amount from the most recent dividend
                    last_amount = None
                    try:
                        divs = ticker.dividends
                        if divs is not None and len(divs) > 0:
                            last_amount = float(divs.iloc[-1])
                    except Exception:
                        pass
                    out['dividend'] = {
                        'ex_date': ex_div_date.strftime('%Y-%m-%d'),
                        'estimated_amount_per_share': round(last_amount, 4) if last_amount else None,
                        'yield_pct': round(info.get('dividendYield', 0) * 100, 2) if info.get('dividendYield') else None,
                    }
        except Exception as e:
            logging.info(f"[calendar] {ticker_symbol} dividend fetch failed: {e}")

        # Earnings info
        try:
            cal = ticker.calendar
            # In recent yfinance versions cal is a dict; in older it's a DataFrame
            if isinstance(cal, dict):
                earnings_dates = cal.get('Earnings Date') or cal.get('earningsDate')
                if earnings_dates:
                    # Could be a single date or a [low, high] window
                    if isinstance(earnings_dates, (list, tuple)) and earnings_dates:
                        e_date = earnings_dates[0]
                    else:
                        e_date = earnings_dates
                    if isinstance(e_date, (date, datetime)):
                        e_date_obj = e_date.date() if isinstance(e_date, datetime) else e_date
                    else:
                        try:
                            e_date_obj = datetime.strptime(str(e_date)[:10], '%Y-%m-%d').date()
                        except (ValueError, TypeError):
                            e_date_obj = None
                    if e_date_obj and e_date_obj >= date.today():
                        eps_est = cal.get('Earnings Average') or cal.get('epsEstimate')
                        out['earnings'] = {
                            'date': e_date_obj.strftime('%Y-%m-%d'),
                            'eps_estimate': round(float(eps_est), 2) if eps_est else None,
                        }
        except Exception as e:
            logging.info(f"[calendar] {ticker_symbol} earnings fetch failed: {e}")

    except Exception as e:
        logging.warning(f"[calendar] {ticker_symbol} top-level fetch failed: {e}")

    _calendar_cache[ticker_symbol] = (time.time(), out)
    return out


def get_upcoming_events(assets: list, days_ahead: int = 30) -> dict:
    """
    Walk the user's assets, fetch dividend + earnings data per ticker in
    parallel (3 workers, conservative for yfinance), and aggregate into
    two date-sorted lists.

    Returns:
        {
            'dividends': [
                {'ticker', 'shares', 'ex_date', 'amount_per_share', 'estimated_total', 'yield_pct'},
                ...
            ],
            'earnings': [
                {'ticker', 'date', 'eps_estimate'},
                ...
            ],
            'window_days': N,
        }
    """
    CASH_LIKE = {'CUR:USD', 'USD', 'CASH', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX',
                 'TMSXX', 'SNSXX', 'FZFXX', 'VBTIX', 'VUSXX'}

    # Aggregate shares per ticker
    ticker_shares: dict = {}
    for a in assets:
        t = (a.ticker or '').upper().strip()
        if not t or t in CASH_LIKE:
            continue
        shares = a.shares or 0
        if shares <= 0:
            continue
        ticker_shares[t] = ticker_shares.get(t, 0) + shares

    if not ticker_shares:
        return {'dividends': [], 'earnings': [], 'window_days': days_ahead}

    cutoff = date.today() + timedelta(days=days_ahead)
    dividends = []
    earnings = []

    with ThreadPoolExecutor(max_workers=3) as ex:
        futures = {ex.submit(_fetch_ticker_calendar, t): t for t in ticker_shares}
        for f in as_completed(futures):
            t = futures[f]
            try:
                result = f.result(timeout=8.0)
            except Exception:
                continue
            shares = ticker_shares[t]

            div = result.get('dividend')
            if div and div.get('ex_date'):
                try:
                    ex_d = datetime.strptime(div['ex_date'], '%Y-%m-%d').date()
                    if ex_d <= cutoff:
                        amt_per_share = div.get('estimated_amount_per_share')
                        est_total = round(amt_per_share * shares, 2) if amt_per_share else None
                        dividends.append({
                            'ticker': t,
                            'shares': round(shares, 4),
                            'ex_date': div['ex_date'],
                            'amount_per_share': amt_per_share,
                            'estimated_total': est_total,
                            'yield_pct': div.get('yield_pct'),
                        })
                except ValueError:
                    pass

            earn = result.get('earnings')
            if earn and earn.get('date'):
                try:
                    e_d = datetime.strptime(earn['date'], '%Y-%m-%d').date()
                    if e_d <= cutoff:
                        earnings.append({
                            'ticker': t,
                            'date': earn['date'],
                            'eps_estimate': earn.get('eps_estimate'),
                        })
                except ValueError:
                    pass

    dividends.sort(key=lambda x: x['ex_date'])
    earnings.sort(key=lambda x: x['date'])

    return {
        'dividends': dividends,
        'earnings': earnings,
        'window_days': days_ahead,
    }
