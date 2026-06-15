import logging
import time
from concurrent.futures import ThreadPoolExecutor

# ARCH-1: Simple in-memory cache for ticker prices (5-minute TTL)
_price_cache = {}
CACHE_TTL_SECONDS = 300 # 5 minutes

# Period-returns cache (5 min TTL). Avoids re-hitting yfinance for every sync —
# yfinance is rate-limit sensitive from Cloud Functions and silently returns
# empty DataFrames when throttled, which was the root cause of 1W/1M N/A.
_period_returns_cache = {}
PERIOD_RETURNS_TTL_SECONDS = 300

# Daily close-price history cache (1h TTL) for the snapshot backfill.
_history_cache = {}
HISTORY_TTL_SECONDS = 3600


def _range_for_days(days):
    """Map a lookback in days to a Yahoo/yfinance range string. Buckets so the
    history cache stays warm across the handful of windows we actually request."""
    if days > 1825:
        return '10y'
    if days > 730:
        return '5y'
    if days > 365:
        return '2y'
    return '1y'


def get_price_history(ticker_symbol, days=400):
    """Daily close prices for roughly the last `days` days.
    Returns {'YYYY-MM-DD': close_price}. Used by backfill_service to reconstruct
    historical portfolio value AND by get_multi_period_returns. Cached 1h per
    (ticker, range). Empty dict on failure."""
    ticker_upper = (ticker_symbol or '').upper().strip()
    if not ticker_upper:
        return {}
    rng = _range_for_days(days)
    # Cache key includes the range — a 1y fetch must not satisfy a later 5y request
    # (the previous ticker-only key silently truncated long-window callers).
    cache_key = f"{ticker_upper}:{rng}"
    cached = _history_cache.get(cache_key)
    if cached and time.time() - cached[0] < HISTORY_TTL_SECONDS:
        return cached[1]
    # PRIMARY: Yahoo's lightweight chart API via direct HTTP with a browser UA.
    # This sidesteps the yfinance library's crumb/consent handshake, which Yahoo
    # blocks from Cloud Functions' datacenter IPs (the documented 1W/1M N/A cause).
    out = _yahoo_chart_history(ticker_upper, days)
    if not out:
        # FALLBACK: the yfinance library (reliable locally; often throttled server-side).
        out = _yfinance_history(ticker_upper, days)
    # Only cache a successful fetch. Caching an empty result would block this ticker
    # for the full TTL after a single transient failure.
    if out:
        _history_cache[cache_key] = (time.time(), out)
    return out


def _yahoo_chart_history(ticker_symbol, days=400):
    """Keyless daily CLOSE history via Yahoo's chart API (single direct HTTP GET).
    Returns {'YYYY-MM-DD': close} of RAW closes (actual market price that day, which
    is what portfolio-value reconstruction needs — not split/dividend-adjusted).
    Tries both Yahoo hosts. Best-effort — never raises."""
    import requests
    from datetime import datetime
    sym = (ticker_symbol or '').upper().strip()
    if not sym:
        return {}
    rng = _range_for_days(days)
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                             'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    for host in ('query1.finance.yahoo.com', 'query2.finance.yahoo.com'):
        try:
            url = f"https://{host}/v8/finance/chart/{sym}?range={rng}&interval=1d"
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code != 200:
                continue
            result = ((resp.json().get('chart') or {}).get('result') or [None])[0]
            if not result:
                continue
            ts = result.get('timestamp') or []
            quote = ((result.get('indicators') or {}).get('quote') or [{}])[0]
            closes = quote.get('close') or []
            out = {}
            for t, c in zip(ts, closes):
                if c is None or c <= 0:
                    continue
                out[datetime.utcfromtimestamp(t).strftime('%Y-%m-%d')] = round(float(c), 4)
            if out:
                logging.info(f"[price_history] {sym}: {len(out)} closes via Yahoo chart API ({host})")
                return out
        except Exception as e:
            logging.warning(f"[price_history] {sym} chart API {host} failed: {type(e).__name__}")
            continue
    return {}


def _yfinance_history(ticker_symbol, days=400):
    """Daily CLOSE history via the yfinance library. Fallback for when the chart
    API is unavailable. Returns {'YYYY-MM-DD': close}. Best-effort — never raises."""
    import yfinance as yf
    ticker_upper = (ticker_symbol or '').upper().strip()
    out = {}
    try:
        period = _range_for_days(days)
        hist = yf.Ticker(ticker_upper).history(period=period, auto_adjust=False)
        if hist is not None and len(hist) > 0:
            for idx, row in hist.iterrows():
                try:
                    close = float(row['Close'])
                    if close > 0:
                        out[idx.strftime('%Y-%m-%d')] = round(close, 4)
                except Exception:
                    continue
            logging.info(f"[price_history] {ticker_upper}: {len(out)} closes via yfinance library")
    except Exception as e:
        logging.warning(f"[price_history] {ticker_upper} yfinance failed: {type(e).__name__}: {e}")
    return out

def _stooq_fallback(ticker_symbol):
    """Keyless secondary price source for when yfinance is throttled or down.
    Uses Stooq's light CSV quote endpoint (no API key). Daily change is a rough
    Open→Close proxy since the light endpoint carries no previous close.
    Returns a price dict or None. Best-effort — never raises."""
    import requests, csv, io
    sym = (ticker_symbol or '').lower().strip()
    if not sym:
        return None
    # Stooq suffixes US equities/ETFs with `.us`; try that first, then bare symbol.
    for s in (f"{sym}.us", sym):
        try:
            url = f"https://stooq.com/q/l/?s={s}&f=sd2t2ohlcv&h&e=csv"
            resp = requests.get(url, timeout=4)
            if resp.status_code != 200:
                continue
            rows = list(csv.DictReader(io.StringIO(resp.text)))
            if not rows:
                continue
            row = rows[0]
            close = row.get('Close')
            if close in (None, '', 'N/D'):
                continue
            price = float(close)
            if price <= 0:
                continue
            try:
                open_p = float(row.get('Open') or 0)
            except (ValueError, TypeError):
                open_p = 0
            chg_usd = round(price - open_p, 2) if open_p > 0 else 0.0
            chg_pct = round((chg_usd / open_p) * 100, 2) if open_p > 0 else 0.0
            logging.info(f"[price] {ticker_symbol}: served from Stooq fallback (${price})")
            return {
                'current_price': round(price, 2),
                'daily_change_usd': chg_usd,
                'daily_change_percent': chg_pct,
                'sector': 'Other',
            }
        except Exception:
            continue
    return None


def get_current_price(ticker_symbol):
    """
    Fetches the current market price and daily change for a given ticker symbol using yfinance.
    Returns a dict with current_price, daily_change_usd, daily_change_percent.
    Uses an in-memory cache to avoid redundant hits. Falls back to Stooq when
    yfinance returns nothing (it's an unofficial scraper that breaks periodically).
    """
    import yfinance as yf
    
    if not ticker_symbol:
        return None
        
    # Standardize ticker
    ticker_symbol = ticker_symbol.upper().strip()
    
    # 1. Handle Cash & Money Market
    if ticker_symbol in ['CASH', 'CUR:USD', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX', 'CASH:USD', 'VMFXX']:
        return {
            'current_price': 1.0,
            'daily_change_usd': 0.0,
            'daily_change_percent': 0.0,
            'sector': 'Financial Services'
        }

    # 2. Check Cache
    cached_data = _price_cache.get(ticker_symbol)
    if cached_data:
        timestamp, data = cached_data
        if time.time() - timestamp < CACHE_TTL_SECONDS:
            logging.debug(f"Cache hit for {ticker_symbol}")
            return data

    try:
        ticker = yf.Ticker(ticker_symbol)
        # Fetch 2 days to get previous close
        hist = ticker.history(period='2d')

        if hist.empty or len(hist) < 1:
            fb = _stooq_fallback(ticker_symbol)
            if fb:
                _price_cache[ticker_symbol] = (time.time(), fb)
            return fb
            
        current_price = float(hist['Close'].iloc[-1])
        
        # Calculate daily change if 2 days of data are available
        if len(hist) >= 2:
            prev_close = float(hist['Close'].iloc[-2])
            daily_change_usd = current_price - prev_close
            daily_change_percent = (daily_change_usd / prev_close) * 100
        else:
            daily_change_usd = 0.0
            daily_change_percent = 0.0

        # Fetch sector/industry info (Optimized with timeout to prevent hangs)
        sector = 'Other'
        try:
            # Ticker.info is notoriously slow; we isolate it to prevent blocking the entire sync
            with ThreadPoolExecutor(max_workers=1) as sub_executor:
                info_future = sub_executor.submit(lambda: ticker.info)
                info = info_future.result(timeout=2.0)
                sector = info.get('sector')
                if not sector:
                    # Fallback for ETFs and Mutual Funds
                    sector = info.get('category') or info.get('fund_family') or info.get('quoteType', 'Other').replace('_', ' ').capitalize()
        except Exception:
            logging.warning(f"Timeout or error fetching metadata for {ticker_symbol}. Using 'Other'.")

        result = {
            'current_price': round(current_price, 2),
            'daily_change_usd': round(daily_change_usd, 2),
            'daily_change_percent': round(daily_change_percent, 2),
            'sector': sector or 'Other'
        }
        
        # Update Cache
        _price_cache[ticker_symbol] = (time.time(), result)
        return result
        
    except Exception as e:
        logging.error(f"Error fetching price for {ticker_symbol}: {e}")
        # yfinance failed — try the keyless Stooq fallback before giving up.
        fb = _stooq_fallback(ticker_symbol)
        if fb:
            _price_cache[ticker_symbol] = (time.time(), fb)
        return fb

def get_multiple_prices(tickers):
    """
    ARCH-1: Parallel price fetching for multiple tickers.
    Deduplicates tickers and uses a ThreadPoolExecutor.
    """
    unique_tickers = list(set([t.upper().strip() for t in tickers if t]))
    if not unique_tickers:
        return {}
        
    results = {}
    
    # Reduced max_workers to be more Cloud Function friendly (less resource contention)
    with ThreadPoolExecutor(max_workers=5) as executor:
        # map returns results in the same order as unique_tickers
        future_to_ticker = {executor.submit(get_current_price, t): t for t in unique_tickers}
        
        # Hard cap at 12 seconds for the entire batch to avoid function timeout
        start_time = time.time()
        for future in future_to_ticker:
            ticker = future_to_ticker[future]
            elapsed = time.time() - start_time
            remaining = max(0.1, 12 - elapsed)
            
            try:
                results[ticker] = future.result(timeout=remaining)
            except Exception as e:
                logging.error(f"Parallel fetch error or timeout for {ticker}: {e}")
                results[ticker] = None
                
    return results

def validate_ticker(ticker_symbol):
    """Returns True if ticker is valid, False otherwise."""
    if not ticker_symbol or ticker_symbol.upper() == 'CASH':
        return True
    price = get_current_price(ticker_symbol)
    return price is not None

def get_period_return(ticker_symbol, period='ytd'):
    """Returns the % price return for a ticker over a given yfinance period string."""
    import yfinance as yf
    try:
        hist = yf.Ticker(ticker_symbol.upper()).history(period=period)
        if len(hist) >= 2:
            return round(((float(hist['Close'].iloc[-1]) / float(hist['Close'].iloc[0])) - 1) * 100, 2)
        return None
    except Exception:
        return None

def get_multi_period_returns(ticker_symbol, since_date=None):
    """Fetch % returns for multiple time periods from a single yfinance history query.
    Returns dict like {'1w': 2.3, '1m': -1.5, 'ytd': 5.2, '1y': 12.1, ...}

    since_date: optional ISO date string (e.g. '2024-03-12') — when provided, the 'all'
    period is anchored to that date rather than the full 5-year history. This ensures the
    benchmark 'all' return matches the user's actual investment start date.

    Caches results for 5 minutes per (ticker, since_date) pair to avoid hammering
    yfinance during consecutive syncs.
    """
    from datetime import datetime, timedelta

    ticker_upper = (ticker_symbol or '').upper().strip()
    if not ticker_upper:
        return {}

    cache_key = f"{ticker_upper}:{since_date or ''}"
    cached = _period_returns_cache.get(cache_key)
    if cached:
        ts, data = cached
        if time.time() - ts < PERIOD_RETURNS_TTL_SECONDS:
            return data

    try:
        # Source closes from get_price_history — the keyless Yahoo chart API (browser
        # UA, direct HTTP) which is NOT blocked from Cloud Functions' datacenter IPs.
        # The yfinance library's crumb handshake IS blocked there and silently returns
        # empty frames, which was the real cause of period returns showing N/A. Returns
        # RAW (price-only) closes, so this is a price return — consistent with the
        # snapshot-based portfolio period return (dividends are tracked separately).
        hist = get_price_history(ticker_upper, days=1830)  # ~5y window
        if not hist or len(hist) < 2:
            logging.info(f"[period_returns] {ticker_upper}: {len(hist) if hist else 0} closes — skipping")
            # Do NOT cache the empty result — a transient fetch failure would otherwise
            # block this ticker for the full TTL. Let the next sync retry.
            return {}

        items = sorted(hist.items())  # [(YYYY-MM-DD, close), ...] ascending
        dates = [d for d, _ in items]
        closes = [c for _, c in items]
        last_close = closes[-1]
        last_idx = len(dates) - 1
        last_date = datetime.strptime(dates[-1], '%Y-%m-%d').date()

        def _return_since(target_str):
            """% return from the earliest close on/after target_str to the latest close.
            Requires the start point to precede the last point (≥2 data points in window)."""
            for i, d in enumerate(dates):
                if d >= target_str:
                    if i >= last_idx:
                        return None  # only the final point falls in the window
                    sc = closes[i]
                    return round(((last_close / sc) - 1) * 100, 2) if sc > 0 else None
            return None

        results = {}
        # 1w uses 10 calendar days instead of 7 so weekend syncs still find a trading
        # day at the start of the window (a strict 7d window can land entirely on
        # non-trading days). 10d still gives a clean ~5 trading-day window.
        for pkey, days in [('1w', 10), ('1m', 35), ('1y', 365), ('2y', 730), ('5y', 1825)]:
            target = (last_date - timedelta(days=days)).strftime('%Y-%m-%d')
            r = _return_since(target)
            if r is not None:
                results[pkey] = r
        # YTD
        r = _return_since(f"{last_date.year}-01-01")
        if r is not None:
            results['ytd'] = r
        # All — anchor to since_date if provided (matches the user's actual portfolio
        # start), otherwise use the earliest available close in the window.
        if since_date:
            r = _return_since(since_date)
            if r is not None:
                results['all'] = r
        elif closes[0] > 0:
            results['all'] = round(((last_close / closes[0]) - 1) * 100, 2)

        logging.info(f"[period_returns] {ticker_upper}: {len(results)} periods → {sorted(results.keys())}")
        if results:
            _period_returns_cache[cache_key] = (time.time(), results)
        return results
    except Exception as e:
        logging.warning(f"[period_returns] {ticker_upper} failed: {type(e).__name__}: {e}")
        return {}

if __name__ == '__main__':
    # Test batch fetch
    # print(get_multiple_prices(['AAPL', 'MSFT', 'GOOGL', 'CASH']))
    pass
