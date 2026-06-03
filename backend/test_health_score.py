"""
Tests for health_score_service — the 0-100 Financial Health Score.

Covers the pure scorers (boundary values), the asset-valuation helper that
caused the 2313% debt-ratio bug, and the trailing-90-day savings-rate logic
(the fix for paycheck-timing swings). Run: `pytest` or `python test_health_score.py`.
"""
from datetime import date
from models import User, Asset, Debt, Income, Paystub, Transaction, FilingStatus, USState, AssetType, IncomeType, DebtType
from health_score_service import (
    _score_savings_rate, _score_emergency_fund, _score_debt_ratio, _score_diversification,
    _asset_market_value, _compute_debt_to_asset, _compute_diversification,
    _compute_savings_rate, compute_health_score,
)


# ── Pure scorers: boundary values ─────────────────────────────────────────────
def test_score_savings_rate_bounds():
    assert _score_savings_rate(20) == 25       # ≥20% = full
    assert _score_savings_rate(40) == 25       # capped
    assert _score_savings_rate(10) == 12.5     # linear
    assert _score_savings_rate(0) == 0
    assert _score_savings_rate(-5) == 0        # negative floored
    assert _score_savings_rate(None) == 0      # insufficient data


def test_score_emergency_fund_bounds():
    assert _score_emergency_fund(6) == 25
    assert _score_emergency_fund(12) == 25
    assert _score_emergency_fund(3) == 12.5
    assert _score_emergency_fund(0) == 0
    assert _score_emergency_fund(None) == 0


def test_score_debt_ratio_bounds():
    assert _score_debt_ratio(20) == 25         # ≤20% = full
    assert _score_debt_ratio(0) == 25          # debt-free = full
    assert _score_debt_ratio(100) == 0         # debt == assets
    assert _score_debt_ratio(60) == 12.5       # midpoint of 20→100
    assert _score_debt_ratio(None) == 0        # no assets


def test_score_diversification_bounds():
    assert _score_diversification({'cash', 'stocks', 'bonds', 'real_estate'}) == 25
    assert _score_diversification({'cash', 'stocks'}) == 12.5
    assert _score_diversification(set()) == 0


# ── _asset_market_value: the dollar-vs-shares distinction ─────────────────────
def test_asset_value_cash_uses_shares_as_dollars():
    a = Asset(ticker='CASH', shares=5000, cost_basis=1.0, asset_type=AssetType.CASH)
    assert _asset_market_value(a) == 5000.0


def test_asset_value_housing_uses_shares_as_dollars():
    a = Asset(ticker='HOME', shares=400000, cost_basis=1.0, asset_type=AssetType.HOUSING)
    assert _asset_market_value(a) == 400000.0


def test_asset_value_stock_uses_shares_times_cost_basis_without_price():
    # No live current_price attribute → falls back to shares × cost_basis.
    a = Asset(ticker='AAPL', shares=10, cost_basis=50.0, asset_type=AssetType.STOCK)
    assert _asset_market_value(a) == 500.0


def test_debt_to_asset_ratio_counts_cash_correctly():
    # Regression: cash + housing must be valued at their dollar balance, not zeroed.
    assets = [Asset(ticker='CASH', shares=8000, cost_basis=1.0, asset_type=AssetType.CASH)]
    debts = [Debt(name='Card', initial_amount=2000, amount_paid=0, debt_type=DebtType.INSTALLMENT)]
    assert _compute_debt_to_asset(assets, debts) == 25.0


def test_diversification_counts_distinct_categories():
    assets = [
        Asset(ticker='CASH', shares=1000, cost_basis=1.0, asset_type=AssetType.CASH),
        Asset(ticker='AAPL', shares=1, cost_basis=100, asset_type=AssetType.STOCK),
        Asset(ticker='BND', shares=1, cost_basis=80, asset_type=AssetType.BOND),
        Asset(ticker='HOME', shares=300000, cost_basis=1.0, asset_type=AssetType.HOUSING),
    ]
    cats = _compute_diversification(assets)
    assert cats == {'cash', 'stocks', 'bonds', 'real_estate'}


# ── Savings rate: trailing-90-day window (the headline fix) ───────────────────
TODAY = date(2026, 6, 15)


def _txn(amount, d, category='Shopping'):
    return Transaction(id='t', user_id='u', account_id='a', amount=amount, date=d, name='x', category=category)


def _paystub(gross, net, d, is_net_primary=False):
    return Paystub(id='p', user_id='u', date=d, gross_amount=gross, net_amount=net, is_net_primary=is_net_primary)


def test_savings_rate_basic():
    paystubs = [_paystub(5000, 4000, '2026-05-01')]
    txns = [_txn(2000, '2026-05-10')]
    rate, source = _compute_savings_rate([], paystubs, txns, TODAY)
    assert rate == 50.0           # (4000 - 2000) / 4000
    assert source == '90d'


def test_savings_rate_net_primary_uses_gross_field_as_deposit():
    # is_net_primary paystubs store the NET deposit in gross_amount.
    paystubs = [_paystub(4000, None, '2026-05-01', is_net_primary=True)]
    txns = [_txn(1000, '2026-05-10')]
    rate, source = _compute_savings_rate([], paystubs, txns, TODAY)
    assert rate == 75.0           # (4000 - 1000) / 4000


def test_savings_rate_no_income_signal():
    # Spending but no income detected at all.
    rate, source = _compute_savings_rate([], [], [_txn(500, '2026-05-10')], TODAY)
    assert rate is None
    assert source == 'no_income'


def test_savings_rate_no_transactions():
    rate, source = _compute_savings_rate([], [_paystub(5000, 4000, '2026-05-01')], [], TODAY)
    assert rate is None
    assert source == 'none'


def test_savings_rate_insufficient_income_flag():
    # Tiny detected income dwarfed by spending (>4×) and no manual baseline → flagged.
    paystubs = [_paystub(1000, 1000, '2026-05-01')]
    txns = [_txn(5000, '2026-05-10')]
    rate, source = _compute_savings_rate([], paystubs, txns, TODAY)
    assert rate is None
    assert source == 'insufficient_income'


def test_savings_rate_manual_baseline_floor():
    # Manual monthly_income acts as a denominator floor so a missed paystub
    # detection doesn't tank the rate.
    incomes = [Income(income_type=IncomeType.ANNUAL_SALARY, amount=120000, monthly_income=10000)]
    txns = [_txn(6000, '2026-05-10')]
    rate, source = _compute_savings_rate(incomes, [], txns, TODAY)
    # baseline_total = 10000 × 3 = 30000; (30000 - 6000)/30000 = 80%
    assert rate == 80.0
    assert source == '90d_with_baseline'


# ── Integration: full score is the sum of its parts and in range ──────────────
def test_compute_health_score_structure():
    user = User(filing_status=FilingStatus.SINGLE, state=USState.CA)
    assets = [
        Asset(ticker='CASH', shares=6000, cost_basis=1.0, asset_type=AssetType.CASH),
        Asset(ticker='AAPL', shares=10, cost_basis=50, asset_type=AssetType.STOCK),
    ]
    debts = [Debt(name='Card', initial_amount=1000, amount_paid=0, debt_type=DebtType.INSTALLMENT)]
    paystubs = [_paystub(6000, 5000, '2026-05-01')]
    txns = [_txn(2000, '2026-05-10')]
    result = compute_health_score(user, [], assets, debts, txns, paystubs, today=TODAY)

    comps = result['components']
    assert set(comps.keys()) == {'savings_rate', 'emergency_fund', 'debt_ratio', 'diversification'}
    # Each component bounded 0..25
    for c in comps.values():
        assert 0 <= c['score'] <= 25
    # Total is the rounded sum of the four parts, bounded 0..100
    expected = round(sum(c['score'] for c in comps.values()))
    assert result['score'] == expected
    assert 0 <= result['score'] <= 100


if __name__ == '__main__':
    fns = [v for k, v in sorted(globals().items()) if k.startswith('test_') and callable(v)]
    for fn in fns:
        fn()
        print(f"  [pass] {fn.__name__}")
    print(f"All {len(fns)} health-score tests passed!")
