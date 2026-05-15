"""
subscription_service
─────────────────────────────────────────────────────────────────────────────
Detects recurring subscription charges from a user's transaction history.

Strategy: cluster transactions by normalized merchant name, then for each
cluster check if there's a regular monthly cadence at a consistent dollar
amount. Flag clusters with ≥2 charges in the last 90 days that look monthly.

Heuristics calibrated for personal-finance use:
- Normalize merchant name (lowercase, strip date suffixes, strip 6+ digit
  trailing numbers that are typically transaction IDs).
- Amount range: $1.99 to $999. Filters out one-time large purchases and
  micro-charges (test transactions).
- Cadence: median day-gap between consecutive charges must be between
  20 and 35 days (monthly window).
- Amount consistency: stdev of amounts ≤ 15% of median.
- Recency: at least one charge in the last 45 days. Charges older than
  that are surfaced separately as "possibly cancelled / forgotten".

Returns plain dicts (not models) so the API layer can JSON-serialize directly.
"""

from __future__ import annotations
import re
import logging
import statistics
from datetime import datetime, timedelta
from collections import defaultdict
from typing import List, Dict, Any


# Regexes for merchant normalization. Strip the things that vary per charge:
_TRAILING_DATE = re.compile(r'\b\d{1,2}[/\-]\d{1,2}([/\-]\d{2,4})?\b')
_LONG_NUMBERS  = re.compile(r'\b\d{5,}\b')   # transaction IDs
_PUNCT         = re.compile(r'[#*]+\s*\d*')   # "*1234", "#5678"
_WHITESPACE    = re.compile(r'\s+')
# Common payment-processor prefixes that obscure the real merchant
_PROCESSOR_PREFIXES = (
    'sq *', 'sq*', 'square *', 'square*',
    'tst* ', 'tst*',
    'paypal *', 'paypal*',
    'stripe *', 'stripe*',
    'venmo*', 'venmo *',
)


def _normalize_merchant(name: str) -> str:
    if not name:
        return ''
    s = name.lower().strip()
    # Strip processor prefixes
    for pfx in _PROCESSOR_PREFIXES:
        if s.startswith(pfx):
            s = s[len(pfx):].strip()
            break
    s = _TRAILING_DATE.sub('', s)
    s = _LONG_NUMBERS.sub('', s)
    s = _PUNCT.sub('', s)
    s = _WHITESPACE.sub(' ', s).strip()
    return s


def _parse_date(d) -> datetime | None:
    if isinstance(d, datetime):
        return d
    if not d:
        return None
    try:
        return datetime.strptime(d, '%Y-%m-%d')
    except (ValueError, TypeError):
        return None


def detect_subscriptions(
    transactions: List[Any],
    ignored_merchants: List[str] = None,
    manual_subscriptions: List[Dict[str, Any]] = None,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Walk the user's transactions and group them into detected subscriptions.

    Returns:
      {
        'active':    [...],  # at least one charge in last 45 days
        'inactive':  [...],  # last charge older than 45 days (likely cancelled or forgotten)
        'manual':    [...],  # user-added subscriptions that weren't auto-detected
      }
    """
    ignored_merchants = set((m or '').lower() for m in (ignored_merchants or []))
    manual_subscriptions = manual_subscriptions or []

    # Bucket transactions by normalized merchant
    buckets: Dict[str, List[Any]] = defaultdict(list)
    for t in transactions:
        # Only spending — positive amounts in this app's convention. Skip refunds, transfers, ignored.
        amt = getattr(t, 'amount', 0) or 0
        if amt <= 1.99 or amt > 999:
            continue
        category = getattr(t, 'category', '') or ''
        if category in ('Ignore', 'Transfer', 'Income', 'Refund'):
            continue
        name = getattr(t, 'name', '') or ''
        norm = _normalize_merchant(name)
        if not norm:
            continue
        if norm in ignored_merchants:
            continue
        buckets[norm].append(t)

    now = datetime.utcnow()
    active = []
    inactive = []

    for merchant_norm, txns in buckets.items():
        if len(txns) < 2:
            continue
        # Sort by date ascending
        dated = sorted(
            ((_parse_date(getattr(t, 'date', None)), t) for t in txns),
            key=lambda x: (x[0] is None, x[0] or datetime.min)
        )
        dates = [d for d, _ in dated if d is not None]
        if len(dates) < 2:
            continue

        # Amount consistency check — stdev relative to median ≤ 15%
        amounts = [abs(getattr(t, 'amount', 0)) for _, t in dated]
        med_amt = statistics.median(amounts)
        if med_amt <= 0:
            continue
        if len(amounts) >= 2:
            stdev = statistics.stdev(amounts)
            if stdev / med_amt > 0.15:
                continue

        # Cadence check — median gap between consecutive charges should be ~monthly (20–35 days)
        gaps = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
        if not gaps:
            continue
        med_gap = statistics.median(gaps)
        if med_gap < 20 or med_gap > 40:
            # Allow up to ~40 to catch slightly-irregular monthly bills
            continue

        latest = max(dates)
        days_since = (now - latest).days

        # Pick the most-common original merchant name for display (longest tied-mode)
        original_names = [getattr(t, 'name', '') for _, t in dated]
        display_name = max(
            set(original_names),
            key=lambda n: (original_names.count(n), len(n))
        )

        # Category — use mode of the cluster's categories
        cats = [getattr(t, 'category', None) for _, t in dated if getattr(t, 'category', None)]
        category = statistics.mode(cats) if cats else 'Subscriptions'

        annualized = med_amt * 12
        entry = {
            'merchant_normalized': merchant_norm,
            'merchant_display': display_name,
            'monthly_amount': round(med_amt, 2),
            'annual_amount': round(annualized, 2),
            'charge_count': len(dated),
            'latest_charge_date': latest.strftime('%Y-%m-%d'),
            'first_charge_date': dates[0].strftime('%Y-%m-%d'),
            'days_since_last_charge': days_since,
            'median_cadence_days': int(med_gap),
            'amount_stdev_pct': round((stdev / med_amt * 100) if len(amounts) >= 2 else 0, 1),
            'category': category,
        }

        # 45-day recency split: active = still being charged, inactive = forgotten / cancelled
        if days_since <= 45:
            active.append(entry)
        else:
            entry['flag'] = 'possibly_cancelled' if days_since > 90 else 'possibly_forgotten'
            inactive.append(entry)

    # Sort descending by annual amount — most expensive first
    active.sort(key=lambda x: x['annual_amount'], reverse=True)
    inactive.sort(key=lambda x: x['annual_amount'], reverse=True)

    return {
        'active': active,
        'inactive': inactive,
        'manual': [
            {
                'merchant_display': m.get('name', 'Manual'),
                'merchant_normalized': _normalize_merchant(m.get('name', '')),
                'monthly_amount': round(float(m.get('monthly_amount', 0)), 2),
                'annual_amount': round(float(m.get('monthly_amount', 0)) * 12, 2),
                'category': m.get('category', 'Subscriptions'),
                'source': 'manual',
            }
            for m in manual_subscriptions
        ],
        'summary': {
            'active_count': len(active),
            'total_monthly_active': round(sum(x['monthly_amount'] for x in active), 2),
            'total_annual_active': round(sum(x['annual_amount'] for x in active), 2),
            'inactive_count': len(inactive),
            'total_monthly_inactive': round(sum(x['monthly_amount'] for x in inactive), 2),
        },
    }
