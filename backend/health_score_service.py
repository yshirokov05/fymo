"""
health_score_service
─────────────────────────────────────────────────────────────────────────────
Financial Health Score 0-100. Four equally-weighted 25-point components:

  1. Savings rate (trailing-3-month rolling)
  2. Emergency fund months (liquid assets / monthly spend)
  3. Debt-to-asset ratio
  4. Asset diversification

The savings-rate calculation is critical: per the agreed roadmap, the current
calendar-month savings rate swings wildly depending on paycheck timing, so we
use trailing-3-month complete months. If the user has fewer than 3 months of
data, we fall back to YTD-averaged.

Snapshots written daily to /users/{uid}/health_score_snapshots/{YYYY-MM-DD}
so the score can be charted over time.
"""

from __future__ import annotations
import logging
from datetime import datetime, date, timedelta
from collections import defaultdict


LIQUID_TYPES = {'CASH', 'SAVINGS', 'CHECKING', 'HIGH_YIELD_SAVINGS'}
# Asset types whose `shares` field stores a dollar amount directly (not unit count).
# Mirrors the list in calculations.py / Dashboard.js — keep in sync.
DOLLAR_VALUED_TYPES = {'CASH', 'SAVINGS', 'CHECKING', 'HIGH_YIELD_SAVINGS', 'HOUSING'}
LIQUID_TICKERS = {
    'CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX',
    'TMSXX', 'VBTIX', 'VUSXX', 'SNSXX', 'FZFXX',
}
# Categories that are NOT spending in the health-score sense
NON_SPEND_CATEGORIES = {'Ignore', 'Transfer', 'Income', 'Refund', 'Investment'}


def _asset_market_value(a):
    """Return the dollar value of an Asset, mirroring the canonical logic in
    calculations.calculate_net_worth.

    Critical: for cash-type assets (CASH/SAVINGS/CHECKING/HIGH_YIELD_SAVINGS) and
    HOUSING, the `shares` field stores a dollar amount directly — multiplying by
    `cost_basis` or `current_price` would zero them out (cost_basis is typically 0
    or 1 for cash). The previous implementation did exactly that, which is why the
    debt-to-asset ratio came out as 2313% (the entire $109k of cash + housing was
    being valued at ~$1.5k of market-priced positions only).
    """
    if a is None:
        return 0.0
    atype = getattr(a, 'asset_type', None)
    atype_name = atype.name if atype else ''
    ticker = (getattr(a, 'ticker', '') or '').upper()
    shares = float(getattr(a, 'shares', 0) or 0)
    if atype_name in DOLLAR_VALUED_TYPES or ticker in LIQUID_TICKERS:
        # `shares` is the dollar balance for these types
        return max(0.0, shares)
    # Market-traded: shares × current_price, falling back to cost_basis when
    # the live price is missing.
    current_price = getattr(a, 'current_price', None)
    cost_basis = float(getattr(a, 'cost_basis', 0) or 0)
    price = float(current_price) if (current_price is not None and current_price > 0) else cost_basis
    return max(0.0, shares * price)


def _parse_date(d):
    if isinstance(d, (date, datetime)):
        return d if isinstance(d, date) and not isinstance(d, datetime) else d.date()
    if isinstance(d, str):
        try:
            return datetime.strptime(d[:10], '%Y-%m-%d').date()
        except (ValueError, TypeError):
            return None
    return None


def _complete_months_back(n: int, today: date = None):
    """Return a list of n complete-month windows ending with the most recent
    complete month before today. Each entry is (year, month, first_day, last_day)."""
    if today is None:
        today = date.today()
    # The most recent complete month is the one before today's month
    cur_year, cur_month = today.year, today.month
    windows = []
    for i in range(1, n + 1):
        m = cur_month - i
        y = cur_year
        while m <= 0:
            m += 12
            y -= 1
        # First and last day of (y, m)
        first = date(y, m, 1)
        if m == 12:
            last = date(y + 1, 1, 1) - timedelta(days=1)
        else:
            last = date(y, m + 1, 1) - timedelta(days=1)
        windows.append((y, m, first, last))
    return windows


def _compute_savings_rate(incomes, paystubs, transactions, today: date = None):
    """
    Trailing-90-day rolling savings rate. Returns (rate_pct, source).

    Design decisions (driven by real-user feedback):
      • 90-day rolling window (not "complete months") — smooths month-boundary
        paycheck timing without forcing the user to wait for a month to close.
      • Denominator floor — when a user has set `monthly_income` on a manual
        Income record (their declared baseline), we use it as a minimum income
        denominator so a single missed paystub detection doesn't tank the rate.
      • Cap displayed value at -100% — savings rate is conceptually bounded;
        showing -964% (from sparse income / normal spending) is misleading noise.
      • Insufficient-data signal — when income detected is < 25% of the
        baseline expectation, return source='insufficient_income' so the UI
        can prompt the user to link payroll / add manual income instead of
        rendering a meaningless red number.
    """
    if today is None:
        today = date.today()

    window_days = 90
    start = today - timedelta(days=window_days)
    end = today

    def _income_in_window(s, e):
        # Paystubs hitting the window
        paystub_total = 0.0
        for p in (paystubs or []):
            pd = _parse_date(getattr(p, 'date', None))
            if pd is None or pd < s or pd > e:
                continue
            # Both gross and net-primary paystubs represent real cash received.
            # For savings rate (a cash-flow metric), we want what landed in the
            # account, which is `gross_amount` for net-primary and net_amount
            # (or gross - withheld) for true gross paystubs.
            if getattr(p, 'is_net_primary', False):
                paystub_total += float(getattr(p, 'gross_amount', 0) or 0)
            else:
                # Prefer net_amount; fall back to gross - withheld
                net = getattr(p, 'net_amount', None)
                if net is None or net == 0:
                    net = float(getattr(p, 'gross_amount', 0) or 0) - float(getattr(p, 'tax_withheld', 0) or 0)
                paystub_total += max(0.0, float(net or 0))
        return paystub_total

    def _manual_baseline_per_month():
        # Sum of monthly_income across manual Income records — the user's stated
        # baseline. Net-vs-gross doesn't matter for cash-flow purposes.
        return sum(float(getattr(i, 'monthly_income', 0) or 0) for i in (incomes or []))

    def _spending_in_window(s, e):
        total = 0.0
        for t in (transactions or []):
            td = _parse_date(getattr(t, 'date', None))
            if td is None or td < s or td > e:
                continue
            amt = float(getattr(t, 'amount', 0) or 0)
            if amt <= 0:
                continue
            cat = getattr(t, 'category', '') or ''
            if cat in NON_SPEND_CATEGORIES:
                continue
            total += amt
        return total

    # Need at least some spending data in the window for the metric to mean
    # anything. If the user has no transactions at all, return 'none'.
    has_any_txn = any(
        _parse_date(getattr(t, 'date', None)) and
        start <= _parse_date(getattr(t, 'date', None)) <= end
        for t in (transactions or [])
    )
    if not has_any_txn:
        return None, 'none'

    paystub_income = _income_in_window(start, end)
    spending = _spending_in_window(start, end)
    months_in_window = window_days / 30.0  # ~3.0
    baseline_per_month = _manual_baseline_per_month()
    baseline_total = baseline_per_month * months_in_window

    # Denominator: use the larger of detected paystub income vs. user-declared
    # baseline. This prevents a missed payroll detection (common for stipends /
    # fellowships) from collapsing the denominator.
    income_for_rate = max(paystub_income, baseline_total)

    # If we genuinely have no income signal at all, can't compute meaningfully.
    if income_for_rate <= 0:
        return None, 'no_income'

    # Insufficient-income signal: detected income is far below baseline AND
    # there's no manual baseline to fall back on. The number would be noise.
    if baseline_total == 0 and paystub_income > 0:
        # If spending dwarfs income by >4x, it's almost certainly a detection gap
        if spending > paystub_income * 4:
            return None, 'insufficient_income'

    rate = ((income_for_rate - spending) / income_for_rate) * 100
    # Cap at -100% (can't lose more than your income proportionally)
    rate = max(-100.0, rate)

    source = '90d_with_baseline' if baseline_total > paystub_income else '90d'
    return round(rate, 1), source


def _compute_emergency_months(assets, transactions, today: date = None):
    """Liquid assets / average monthly spend (trailing 3 mo)."""
    if today is None:
        today = date.today()

    liquid_value = 0.0
    for a in (assets or []):
        is_cash_ticker = (a.ticker or '').upper() in LIQUID_TICKERS
        is_cash_type = getattr(a, 'asset_type', None) and a.asset_type.name in LIQUID_TYPES
        if is_cash_type or is_cash_ticker:
            liquid_value += _asset_market_value(a)

    # Average monthly spend over trailing 3 mo (complete months)
    windows = _complete_months_back(3, today)
    if not windows:
        return None
    start = windows[-1][2]
    end = windows[0][3]
    months_count = len(windows)
    total_spend = 0.0
    for t in (transactions or []):
        td = _parse_date(getattr(t, 'date', None))
        if td is None or td < start or td > end:
            continue
        amt = getattr(t, 'amount', 0) or 0
        if amt <= 0:
            continue
        cat = getattr(t, 'category', '') or ''
        if cat in NON_SPEND_CATEGORIES:
            continue
        total_spend += amt
    avg_monthly = total_spend / months_count if months_count > 0 else 0
    if avg_monthly <= 0:
        return None
    return round(liquid_value / avg_monthly, 1)


def _compute_debt_to_asset(assets, debts):
    """Sum of debts / sum of asset values. Uses `_asset_market_value` so cash and
    real estate are valued correctly (their `shares` field IS the dollar amount)."""
    total_debt = sum(
        max(0.0, (d.initial_amount or 0) - (d.amount_paid or 0))
        for d in (debts or [])
    )
    total_assets = sum(_asset_market_value(a) for a in (assets or []))
    if total_assets <= 0:
        return None
    return round((total_debt / total_assets) * 100, 1)


def _compute_diversification(assets):
    """
    Count distinct asset categories the user holds. More variety = more resilient.
    Categories: Cash, Stocks, Bonds, Real Estate, Retirement, Crypto, Other.
    """
    cats = set()
    for a in (assets or []):
        atype = getattr(a, 'asset_type', None)
        atype_name = atype.name if atype else 'OTHER'
        is_cash_ticker = (a.ticker or '').upper() in LIQUID_TICKERS
        if atype_name in LIQUID_TYPES or is_cash_ticker:
            cats.add('cash')
        elif atype_name == 'STOCK':
            cats.add('stocks')
        elif atype_name == 'BOND':
            cats.add('bonds')
        elif atype_name == 'HOUSING':
            cats.add('real_estate')
        elif atype_name == 'CRYPTO':
            cats.add('crypto')
        else:
            cats.add('other')
        # Retirement is orthogonal to asset_type (tax_treatment flag)
        tt = getattr(a, 'tax_treatment', None)
        if tt and tt.name == 'RETIREMENT':
            cats.add('retirement')
    return cats


def _score_savings_rate(rate_pct):
    """≥20% = 25 pts, linear scale down to 0 at 0%. Negative = 0 pts.
    None (insufficient data) also returns 0 — the UI explains why separately."""
    if rate_pct is None:
        return 0
    if rate_pct >= 20:
        return 25
    if rate_pct < 0:
        return 0
    return round((rate_pct / 20) * 25, 1)


def _score_emergency_fund(months):
    """≥6 months = 25 pts, linear 0-6."""
    if months is None:
        return 0
    if months >= 6:
        return 25
    if months < 0:
        return 0
    return round((months / 6) * 25, 1)


def _score_debt_ratio(ratio_pct):
    """≤20% = 25 pts (no debt is best), linear 100% (0 pts) → 20% (25 pts).
    Special case: no assets at all = 0."""
    if ratio_pct is None:
        return 0
    if ratio_pct <= 20:
        return 25
    if ratio_pct >= 100:
        return 0
    # Linear interpolation between (100% → 0 pts) and (20% → 25 pts)
    return round(((100 - ratio_pct) / 80) * 25, 1)


def _score_diversification(cat_set):
    """≥4 distinct categories = 25 pts, fewer scales down."""
    n = len(cat_set or [])
    if n >= 4:
        return 25
    return round((n / 4) * 25, 1)


def compute_health_score(user, incomes, assets, debts, transactions, paystubs, today: date = None):
    """Top-level entry. Returns the full breakdown dict."""
    if today is None:
        today = date.today()

    sav_rate, sav_source = _compute_savings_rate(incomes, paystubs, transactions, today)
    em_months = _compute_emergency_months(assets, transactions, today)
    debt_ratio = _compute_debt_to_asset(assets, debts)
    div_cats = _compute_diversification(assets)

    s_savings = _score_savings_rate(sav_rate)
    s_emergency = _score_emergency_fund(em_months)
    s_debt = _score_debt_ratio(debt_ratio)
    s_div = _score_diversification(div_cats)
    total = round(s_savings + s_emergency + s_debt + s_div)

    return {
        'score': total,
        'date': today.strftime('%Y-%m-%d'),
        'components': {
            'savings_rate': {
                'value': sav_rate,                # e.g. 18.5 (pct) or None when no signal
                'source': sav_source,             # '90d' | '90d_with_baseline' | 'insufficient_income' | 'no_income' | 'none'
                'score': s_savings,
                'max': 25,
                'label': 'Savings Rate',
                'description': '≥20% earns full marks. Rolling trailing-90-day window; uses your manual monthly_income as a floor so a missed paycheck detection doesn\'t tank the score. Capped at -100%.',
            },
            'emergency_fund': {
                'value': em_months,
                'score': s_emergency,
                'max': 25,
                'label': 'Emergency Fund',
                'description': '≥6 months of expenses in liquid assets earns full marks.',
            },
            'debt_ratio': {
                'value': debt_ratio,
                'score': s_debt,
                'max': 25,
                'label': 'Debt / Assets',
                'description': '≤20% debt-to-asset ratio earns full marks. 0 debt is ideal.',
            },
            'diversification': {
                'value': sorted(div_cats),
                'count': len(div_cats),
                'score': s_div,
                'max': 25,
                'label': 'Diversification',
                'description': '4+ distinct asset categories (cash, stocks, bonds, real estate, retirement, etc.) earns full marks.',
            },
        },
    }


def take_health_snapshot(db, user_id: str, snapshot: dict):
    """Persist today's score to /users/{uid}/health_score_snapshots/{YYYY-MM-DD}.
    Idempotent — overwrites if syncing multiple times the same day."""
    if not db or not user_id or user_id == 'guest':
        return
    try:
        date_str = snapshot.get('date')
        if not date_str:
            return
        ref = db.collection('users').document(user_id).collection('health_score_snapshots').document(date_str)
        ref.set({
            'date': date_str,
            'score': snapshot.get('score', 0),
            'components': {
                k: {'value': v.get('value'), 'score': v.get('score')}
                for k, v in (snapshot.get('components') or {}).items()
            },
        }, merge=True)
    except Exception as e:
        logging.warning(f"[health_score] snapshot failed for {user_id}: {e}")


def get_health_history(db, user_id: str, limit: int = 90):
    """Return up to N most recent health score snapshots, sorted ascending."""
    if not db or not user_id or user_id == 'guest':
        return []
    try:
        from firebase_admin import firestore as _firestore
        snaps = db.collection('users').document(user_id) \
            .collection('health_score_snapshots') \
            .order_by('date', direction=_firestore.Query.DESCENDING) \
            .limit(limit) \
            .get()
        out = []
        for s in snaps:
            d = s.to_dict() or {}
            if d.get('date'):
                out.append({'date': d['date'], 'score': d.get('score', 0)})
        return sorted(out, key=lambda x: x['date'])
    except Exception as e:
        logging.error(f"[health_score] history fetch failed for {user_id}: {e}")
        return []
