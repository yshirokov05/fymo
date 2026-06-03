"""
Tests for calculations.calculate_net_worth — the net-worth + asset-valuation core.

Prices are stubbed (no network/yfinance) so these are fast, deterministic unit
tests. Run with `pytest` or directly: `python test_calculations.py`.
"""
import calculations
from calculations import calculate_net_worth
from models import User, Asset, Debt, FilingStatus, USState, AssetType, DebtType


def _with_fake_prices(price_by_ticker, fn):
    """Run fn() with calculations.get_current_price stubbed to fixed prices."""
    original = calculations.get_current_price
    calculations.get_current_price = lambda ticker: {'current_price': price_by_ticker.get(ticker, 0.0)}
    try:
        return fn()
    finally:
        calculations.get_current_price = original


def _user():
    return User(filing_status=FilingStatus.SINGLE, state=USState.CA)


def test_net_worth_cash_plus_stock_minus_debt():
    assets = [
        Asset(ticker='CASH', shares=10000, cost_basis=1.0, asset_type=AssetType.CASH),
        Asset(ticker='AAPL', shares=10, cost_basis=100.0, asset_type=AssetType.STOCK),
    ]
    debts = [Debt(name='Card', initial_amount=5000, amount_paid=1000, debt_type=DebtType.INSTALLMENT)]
    r = _with_fake_prices({'AAPL': 200.0}, lambda: calculate_net_worth(_user(), [], assets, debts))
    # 10,000 cash + (10 × $200) = 12,000 assets; debt remaining 4,000; NW = 8,000
    assert round(r['total_assets_market_value'], 2) == 12000.0
    assert round(r['total_debts'], 2) == 4000.0
    assert round(r['real_time_net_worth'], 2) == 8000.0


def test_stock_falls_back_to_cost_basis_when_no_price():
    assets = [Asset(ticker='OTCX', shares=10, cost_basis=100.0, asset_type=AssetType.STOCK)]
    # price 0 / unavailable → value should fall back to cost_basis × shares = 1,000
    r = _with_fake_prices({'OTCX': 0.0}, lambda: calculate_net_worth(_user(), [], assets, []))
    assert round(r['total_assets_market_value'], 2) == 1000.0


def test_housing_shares_field_is_dollar_value():
    # HOUSING stores the dollar amount in `shares` (not a unit count). Must NOT be
    # multiplied by a price. This is the bug class that produced a 2313% debt ratio.
    assets = [Asset(ticker='HOME', shares=400000, cost_basis=1.0, asset_type=AssetType.HOUSING)]
    r = _with_fake_prices({}, lambda: calculate_net_worth(_user(), [], assets, []))
    assert round(r['total_assets_market_value'], 2) == 400000.0


def test_revolving_debt_uses_initial_amount_not_amount_paid():
    # Revolving (credit card) remaining = initial_amount regardless of amount_paid.
    debts = [Debt(name='Visa', initial_amount=2000, amount_paid=500, debt_type=DebtType.REVOLVING)]
    r = _with_fake_prices({}, lambda: calculate_net_worth(_user(), [], [], debts))
    assert round(r['total_debts'], 2) == 2000.0


def test_zero_shares_contributes_nothing():
    assets = [Asset(ticker='AAPL', shares=0, cost_basis=100.0, asset_type=AssetType.STOCK)]
    r = _with_fake_prices({'AAPL': 200.0}, lambda: calculate_net_worth(_user(), [], assets, []))
    assert round(r['total_assets_market_value'], 2) == 0.0


def test_empty_portfolio_is_zero():
    r = _with_fake_prices({}, lambda: calculate_net_worth(_user(), [], [], []))
    assert r['real_time_net_worth'] == 0.0


if __name__ == '__main__':
    import sys
    fns = [v for k, v in sorted(globals().items()) if k.startswith('test_') and callable(v)]
    for fn in fns:
        fn()
        print(f"  [pass] {fn.__name__}")
    print(f"All {len(fns)} calculation tests passed!")
