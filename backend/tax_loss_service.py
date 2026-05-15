"""
tax_loss_service
─────────────────────────────────────────────────────────────────────────────
Tax-loss harvesting suggestions. Companion to realized_gains_service.py.

Walks the same Plaid investment transaction history but instead of computing
realized gains from sells, it builds the surviving FIFO lot queues (i.e. the
shares the user still owns, with original buy date + cost) and identifies
lots that are currently underwater relative to today's market price.

Output is a list of harvest opportunities — per-lot specificity matters
because the user may want to sell only some lots (e.g. only the short-term
losers, since ST losses offset higher-bracket ordinary income better).

Limitations (surfaced to user):
- Wash-sale rule (IRS §1091) not applied. We do NOT track if the user
  bought the same security within 30 days. A "consult a tax professional"
  disclaimer is added at the API layer.
- Lots from transferred-in shares (no buy history in 5y Plaid window) are
  invisible — those would need manual entry.
- Specific Identification (Spec ID) shares are not distinguished; FIFO is
  assumed throughout.
"""

from __future__ import annotations
from collections import deque
from datetime import datetime, date, timedelta
import logging

# Reuse the cash filter + helpers from the realized-gains service
from realized_gains_service import CASH_LIKE_TICKERS, _to_date, is_option_symbol


def _build_open_lot_queues(inv_txns, inv_sec_map):
    """
    Replay buy/sell history chronologically, returning the queue of surviving
    open lots per (account_id, ticker). Each lot is [buy_date, shares, cost_per_share].
    """
    lot_queues: dict = {}

    def _sort_key(t):
        d = _to_date(t.get('date'))
        ttype = (t.get('type') or '').lower()
        stype = (t.get('subtype') or '').lower()
        is_buy = ttype == 'buy' or stype == 'buy'
        return (d or date.min, 0 if is_buy else 1)

    for txn in sorted(inv_txns, key=_sort_key):
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
        per_share_price = float(txn.get('price') or 0) or (amount / qty)
        acc_id = txn.get('account_id', '')
        key = (acc_id, ticker)

        if is_buy:
            lot_queues.setdefault(key, deque()).append([txn_date, qty, per_share_price])
            continue

        # SELL: drain FIFO lots
        queue = lot_queues.get(key)
        if not queue:
            continue  # unmatched sell — ignore for open-lot purposes
        remaining = qty
        while remaining > 0.0001 and queue:
            lot = queue[0]
            available = lot[1]
            if available <= remaining + 0.0001:
                remaining -= available
                queue.popleft()
            else:
                lot[1] = available - remaining
                remaining = 0
        if not queue:
            lot_queues.pop(key, None)

    return lot_queues


def find_harvest_opportunities(
    inv_txns,
    inv_sec_map,
    current_price_map: dict,
    today: date | None = None,
    min_loss_dollars: float = 25.0,
):
    """
    Return a list of tax-loss harvesting opportunities, sorted by largest
    unrealized loss first.

    Args:
        inv_txns: Plaid investment transactions
        inv_sec_map: dict[security_id] → security dict
        current_price_map: dict[ticker_upper] → {'current_price': float, ...}
                          (the same shape get_multiple_prices returns)
        today: optional override for date-of-record
        min_loss_dollars: don't report losses under this threshold (signal vs noise)

    Returns:
        {
            'opportunities':   [...],   # per-lot list, sorted by loss size desc
            'total_potential_loss_st': float,
            'total_potential_loss_lt': float,
            'total_potential_loss':    float,
            'lot_count': int,
            'note': str,                # disclaimer text
        }
    """
    if today is None:
        today = date.today()

    lot_queues = _build_open_lot_queues(inv_txns, inv_sec_map)

    opportunities = []
    for (acc_id, ticker), queue in lot_queues.items():
        if is_option_symbol(ticker):
            continue  # options have their own tax treatment (§1256), skip for v1
        price_info = current_price_map.get(ticker)
        if not price_info or not isinstance(price_info, dict):
            continue
        current_price = float(price_info.get('current_price') or 0)
        if current_price <= 0:
            continue

        for lot in queue:
            buy_date, shares, cost_per_share = lot
            if shares < 0.0001 or cost_per_share <= 0:
                continue
            current_value = shares * current_price
            cost = shares * cost_per_share
            unrealized = current_value - cost
            if unrealized >= -min_loss_dollars:
                continue  # not underwater enough
            holding_days = (today - buy_date).days if buy_date else 0
            is_long_term = holding_days >= 365
            opportunities.append({
                'ticker': ticker,
                'account_id': acc_id,
                'shares': round(shares, 6),
                'buy_date': buy_date.strftime('%Y-%m-%d') if buy_date else None,
                'holding_days': holding_days,
                'classification': 'LT' if is_long_term else 'ST',
                'cost_per_share': round(cost_per_share, 4),
                'current_price': round(current_price, 4),
                'cost_basis': round(cost, 2),
                'current_value': round(current_value, 2),
                'unrealized_loss': round(unrealized, 2),
                'unrealized_loss_pct': round((unrealized / cost) * 100, 2),
            })

    opportunities.sort(key=lambda x: x['unrealized_loss'])  # most-negative first

    total_st = sum(o['unrealized_loss'] for o in opportunities if o['classification'] == 'ST')
    total_lt = sum(o['unrealized_loss'] for o in opportunities if o['classification'] == 'LT')

    return {
        'opportunities': opportunities,
        'total_potential_loss_st': round(total_st, 2),
        'total_potential_loss_lt': round(total_lt, 2),
        'total_potential_loss': round(total_st + total_lt, 2),
        'lot_count': len(opportunities),
        'note': (
            "Tax-loss harvesting can offset capital gains and up to $3,000 of "
            "ordinary income per year. Wash-sale rules (IRS §1091) prohibit "
            "buying the same or substantially identical security within 30 days "
            "before or after the sale. This tool does NOT check wash-sale "
            "compliance — consult a tax professional before acting."
        ),
    }


def empty_harvest_result():
    return {
        'opportunities': [],
        'total_potential_loss_st': 0.0,
        'total_potential_loss_lt': 0.0,
        'total_potential_loss': 0.0,
        'lot_count': 0,
        'note': '',
    }
