"""
Realized Capital Gains Engine — FIFO lot matcher.

Plaid's investment transactions endpoint gives us buys, sells, and dividends, but
NOT lot-level cost basis on each sell. To compute realized gains, we have to match
sells against buy lots ourselves.

This service implements FIFO (First-In-First-Out) matching, which is the IRS default
for shares without specific identification.

Limitations (documented for users):
- Plaid's transaction lookback is 5 years. Sells of shares purchased >5y ago will
  be marked as "unmatched" (cost basis unknown).
- Account transfers from other brokerages don't include the original buy history,
  so realized gains on transferred shares may be inaccurate.
- Stock splits are sometimes recorded as transactions, sometimes not. The matcher
  preserves share counts but doesn't auto-detect splits.
- Wash-sale rules are NOT applied (would require detecting buy-back within 30 days
  of a loss-taking sell — out of scope for v1).
"""

from collections import deque
from datetime import datetime, date, timedelta
import logging
import re


# Cash-equivalent securities — never produce realized gains worth tracking.
CASH_LIKE_TICKERS = {
    'CUR:USD', 'USD', 'CASH',
    'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX', 'TMSXX', 'SNSXX', 'FZFXX', 'VBTIX', 'VUSXX',
}

PERIOD_KEYS = ('1w', '1m', 'ytd', '1y', '2y', '5y', 'all')

# OCC standard option symbol format: SYMBOL (1-6 chars) + YYMMDD + C/P + STRIKE (8 digits)
# Example: QQQ260210C00613000 = QQQ Feb 10 2026 Call $613.00
_OPTION_RE = re.compile(r'^[A-Z]{1,6}\d{6}[CP]\d{8}$')


def is_option_symbol(ticker):
    """True if ticker matches the OCC option symbol format."""
    if not ticker:
        return False
    return bool(_OPTION_RE.match(ticker))


def parse_option_underlying(ticker):
    """Extract the underlying ticker from an option symbol. Returns None if not an option."""
    if not is_option_symbol(ticker):
        return None
    # Strip trailing 15 chars (YYMMDDCPSSSSSSSS)
    return ticker[:-15]


def _to_date(val):
    """Coerce assorted Plaid date shapes into a date object."""
    if val is None:
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, str):
        try:
            return datetime.strptime(val[:10], '%Y-%m-%d').date()
        except (ValueError, TypeError):
            return None
    return None


def _period_starts(today):
    """Map period keys → start date for that period."""
    return {
        '1w':  today - timedelta(days=7),
        '1m':  today - timedelta(days=30),
        'ytd': today.replace(month=1, day=1),
        '1y':  today - timedelta(days=365),
        '2y':  today - timedelta(days=730),
        '5y':  today - timedelta(days=1825),
        'all': None,
    }


def _empty_period():
    return {'total': 0.0, 'st': 0.0, 'lt': 0.0, 'count': 0}


def compute_realized_gains(inv_txns, inv_sec_map, today=None):
    """
    Walk inv_txns chronologically. Build per-(account_id, ticker) FIFO lot queues
    from buys. On each sell, pop oldest lots and compute realized gain/loss.

    Args:
        inv_txns: list of Plaid investment transaction dicts
        inv_sec_map: dict[security_id] → security dict (must include 'ticker_symbol')
        today: optional override for date-of-record (for testing). Default = today.

    Returns:
        dict with keys:
            total_realized:    sum of all realized gain/loss in lookback window
            total_st:          short-term gains/losses (held <365 days)
            total_lt:          long-term gains/losses (held >=365 days)
            periods:           {period_key: {total, st, lt, count}} for each period
            by_ticker:         {ticker: {total, st, lt, count, sells: [...]}}
            unmatched_proceeds: $ of sells that couldn't be matched to a buy lot
            unmatched_count:   number of unmatched sells
            sell_count:        total sells processed
            earliest_txn_date: ISO date string of earliest txn (informational)
    """
    if today is None:
        today = datetime.now().date()

    period_starts = _period_starts(today)

    # Lot queues: {(account_id, ticker): deque[(buy_date, shares_remaining, cost_per_share)]}
    lot_queues: dict = {}

    # Aggregations
    periods = {pk: _empty_period() for pk in PERIOD_KEYS}
    by_ticker: dict = {}
    unmatched_proceeds = 0.0
    unmatched_count = 0
    sell_count = 0
    earliest = None

    # Sort transactions chronologically. Buys MUST be processed before sells of the
    # same date so the lot queue exists when a same-day sell tries to match.
    def _txn_sort_key(t):
        d = _to_date(t.get('date'))
        # Within same day: buys (priority 0) before sells (priority 1).
        ttype = (t.get('type') or '').lower()
        stype = (t.get('subtype') or '').lower()
        is_buy = ttype == 'buy' or stype == 'buy'
        return (d or date.min, 0 if is_buy else 1)

    sorted_txns = sorted(inv_txns, key=_txn_sort_key)

    for txn in sorted_txns:
        sec_id = txn.get('security_id')
        if not sec_id:
            continue
        sec = inv_sec_map.get(sec_id) or {}
        ticker = (sec.get('ticker_symbol') or '').upper().strip()
        if not ticker or ticker in CASH_LIKE_TICKERS:
            continue

        ttype = (txn.get('type') or '').lower()
        stype = (txn.get('subtype') or '').lower()
        is_buy = ttype == 'buy' or stype == 'buy'
        is_sell = ttype == 'sell' or stype == 'sell'
        if not (is_buy or is_sell):
            continue

        qty = abs(float(txn.get('quantity') or 0))
        if qty < 0.0001:
            continue
        amount = abs(float(txn.get('amount') or 0))
        if amount < 0.01:
            continue

        txn_date = _to_date(txn.get('date'))
        if txn_date is None:
            continue
        if earliest is None or txn_date < earliest:
            earliest = txn_date

        acc_id = txn.get('account_id', '')
        key = (acc_id, ticker)

        # Plaid sometimes provides a per-share price; fall back to amount/qty.
        per_share_price = float(txn.get('price') or 0) or (amount / qty)

        if is_buy:
            if key not in lot_queues:
                lot_queues[key] = deque()
            lot_queues[key].append([txn_date, qty, per_share_price])
            continue

        # SELL: match against FIFO lots.
        sell_count += 1
        sell_proceeds = amount
        sell_cost_basis = 0.0
        sell_st_gain = 0.0
        sell_lt_gain = 0.0
        unmatched_qty = qty
        sell_lots_consumed = []

        queue = lot_queues.get(key)
        remaining_to_match = qty

        while remaining_to_match > 0.0001 and queue and len(queue) > 0:
            lot = queue[0]  # [buy_date, shares_remaining, cost_per_share]
            consume = min(remaining_to_match, lot[1])
            lot_cost = consume * lot[2]
            lot_proceeds = consume * per_share_price
            lot_gain = lot_proceeds - lot_cost
            holding_days = (txn_date - lot[0]).days
            is_long_term = holding_days >= 365

            sell_cost_basis += lot_cost
            if is_long_term:
                sell_lt_gain += lot_gain
            else:
                sell_st_gain += lot_gain
            sell_lots_consumed.append({
                'buy_date': lot[0].isoformat(),
                'shares': round(consume, 4),
                'cost_per_share': round(lot[2], 4),
                'gain': round(lot_gain, 2),
                'holding_days': holding_days,
                'long_term': is_long_term,
            })

            lot[1] -= consume
            remaining_to_match -= consume
            if lot[1] < 0.0001:
                queue.popleft()

        if remaining_to_match > 0.0001:
            # Couldn't match all shares — likely a transfer-in or pre-5y purchase.
            unmatched_qty_for_sell = remaining_to_match
            unmatched_proceeds_for_sell = unmatched_qty_for_sell * per_share_price
            unmatched_proceeds += unmatched_proceeds_for_sell
            unmatched_count += 1
            unmatched_qty = unmatched_qty_for_sell
        else:
            unmatched_qty = 0

        sell_total_gain = sell_st_gain + sell_lt_gain

        # Record on per-ticker aggregation
        if ticker not in by_ticker:
            by_ticker[ticker] = {
                'total': 0.0, 'st': 0.0, 'lt': 0.0, 'count': 0, 'sells': [],
                'is_option': is_option_symbol(ticker),
                'underlying': parse_option_underlying(ticker),
            }
        by_ticker[ticker]['total'] += sell_total_gain
        by_ticker[ticker]['st'] += sell_st_gain
        by_ticker[ticker]['lt'] += sell_lt_gain
        by_ticker[ticker]['count'] += 1
        by_ticker[ticker]['sells'].append({
            'date': txn_date.isoformat(),
            'shares': round(qty - unmatched_qty, 4),
            'proceeds': round(sell_proceeds, 2),
            'cost_basis': round(sell_cost_basis, 2),
            'gain': round(sell_total_gain, 2),
            'st_gain': round(sell_st_gain, 2),
            'lt_gain': round(sell_lt_gain, 2),
            'unmatched_shares': round(unmatched_qty, 4) if unmatched_qty else 0,
        })

        # Record on each applicable period
        for pk, start in period_starts.items():
            if pk == 'all' or (start is not None and txn_date >= start):
                periods[pk]['total'] += sell_total_gain
                periods[pk]['st'] += sell_st_gain
                periods[pk]['lt'] += sell_lt_gain
                periods[pk]['count'] += 1

    # Round outputs for clean JSON
    for pk in periods:
        periods[pk] = {k: (round(v, 2) if isinstance(v, float) else v) for k, v in periods[pk].items()}
    for tk in by_ticker:
        for k in ('total', 'st', 'lt'):
            by_ticker[tk][k] = round(by_ticker[tk][k], 2)
        # Truncate per-ticker sells to most recent 50 to keep payload bounded
        by_ticker[tk]['sells'].sort(key=lambda s: s['date'], reverse=True)
        by_ticker[tk]['sells'] = by_ticker[tk]['sells'][:50]

    total_realized = periods['all']['total']
    total_st = periods['all']['st']
    total_lt = periods['all']['lt']

    # Split totals into stocks vs options for cleaner UI presentation.
    # Options are conceptually different (each contract is unique, FIFO is per-strike-and-expiry)
    # and they tend to clutter the table with many tiny rows.
    stock_total = sum(t['total'] for t in by_ticker.values() if not t['is_option'])
    stock_st = sum(t['st'] for t in by_ticker.values() if not t['is_option'])
    stock_lt = sum(t['lt'] for t in by_ticker.values() if not t['is_option'])
    stock_count = sum(t['count'] for t in by_ticker.values() if not t['is_option'])
    options_total = sum(t['total'] for t in by_ticker.values() if t['is_option'])
    options_st = sum(t['st'] for t in by_ticker.values() if t['is_option'])
    options_lt = sum(t['lt'] for t in by_ticker.values() if t['is_option'])
    options_count = sum(t['count'] for t in by_ticker.values() if t['is_option'])
    options_ticker_count = sum(1 for t in by_ticker.values() if t['is_option'])

    logging.info(
        f"Realized gains: total=${total_realized:.2f} (ST=${total_st:.2f}, LT=${total_lt:.2f}) "
        f"across {sell_count} sells, {unmatched_count} unmatched · "
        f"stocks=${stock_total:.2f} ({stock_count} sells), options=${options_total:.2f} ({options_count} sells)"
    )

    return {
        'total_realized': round(total_realized, 2),
        'total_st': round(total_st, 2),
        'total_lt': round(total_lt, 2),
        'periods': periods,
        'by_ticker': by_ticker,
        'unmatched_proceeds': round(unmatched_proceeds, 2),
        'unmatched_count': unmatched_count,
        'sell_count': sell_count,
        'earliest_txn_date': earliest.isoformat() if earliest else None,
        # Split between stocks and options
        'stock_total': round(stock_total, 2),
        'stock_st': round(stock_st, 2),
        'stock_lt': round(stock_lt, 2),
        'stock_count': stock_count,
        'options_total': round(options_total, 2),
        'options_st': round(options_st, 2),
        'options_lt': round(options_lt, 2),
        'options_count': options_count,
        'options_ticker_count': options_ticker_count,
    }


def empty_realized_gains():
    """Return a default-shape realized_gains dict for users without sell history."""
    return {
        'total_realized': 0.0,
        'total_st': 0.0,
        'total_lt': 0.0,
        'periods': {pk: _empty_period() for pk in PERIOD_KEYS},
        'by_ticker': {},
        'unmatched_proceeds': 0.0,
        'unmatched_count': 0,
        'sell_count': 0,
        'earliest_txn_date': None,
        'stock_total': 0.0,
        'stock_st': 0.0,
        'stock_lt': 0.0,
        'stock_count': 0,
        'options_total': 0.0,
        'options_st': 0.0,
        'options_lt': 0.0,
        'options_count': 0,
        'options_ticker_count': 0,
    }
