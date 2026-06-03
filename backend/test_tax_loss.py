"""
Tests for tax_loss_service.find_harvest_opportunities — underwater-lot detection.

Run: `pytest` or `python test_tax_loss.py`.
"""
from datetime import date
from tax_loss_service import find_harvest_opportunities


def _buy(sec, qty, price, d, acct='a1'):
    return {'security_id': sec, 'type': 'buy', 'quantity': qty,
            'amount': qty * price, 'price': price, 'date': d, 'account_id': acct}


def _sell(sec, qty, price, d, acct='a1'):
    return {'security_id': sec, 'type': 'sell', 'quantity': qty,
            'amount': qty * price, 'price': price, 'date': d, 'account_id': acct}


SEC = {'sec1': {'ticker_symbol': 'NVDA'}}


def test_identifies_underwater_lot_long_term():
    # Bought 10 @ $100 in 2020, now worth $50 → $500 unrealized loss, long-term.
    txns = [_buy('sec1', 10, 100, '2020-01-01')]
    prices = {'NVDA': {'current_price': 50.0}}
    r = find_harvest_opportunities(txns, SEC, prices, today=date(2024, 6, 1))
    assert r['lot_count'] == 1
    opp = r['opportunities'][0]
    assert opp['ticker'] == 'NVDA'
    assert opp['classification'] == 'LT'
    assert round(opp['unrealized_loss'], 2) == -500.0
    assert round(r['total_potential_loss'], 2) == -500.0
    assert round(r['total_potential_loss_lt'], 2) == -500.0


def test_short_term_classification():
    # Bought recently (<1yr before `today`) → short-term loss.
    txns = [_buy('sec1', 10, 100, '2024-01-01')]
    prices = {'NVDA': {'current_price': 70.0}}
    r = find_harvest_opportunities(txns, SEC, prices, today=date(2024, 6, 1))
    assert r['opportunities'][0]['classification'] == 'ST'
    assert round(r['total_potential_loss_st'], 2) == -300.0


def test_winning_position_is_not_a_candidate():
    # Up money → no harvest opportunity.
    txns = [_buy('sec1', 10, 100, '2020-01-01')]
    prices = {'NVDA': {'current_price': 150.0}}
    r = find_harvest_opportunities(txns, SEC, prices, today=date(2024, 6, 1))
    assert r['lot_count'] == 0
    assert r['total_potential_loss'] == 0.0


def test_tiny_loss_below_threshold_excluded():
    # $10 loss is below the default $25 min_loss_dollars threshold → ignored as noise.
    txns = [_buy('sec1', 1, 100, '2020-01-01')]
    prices = {'NVDA': {'current_price': 90.0}}  # -$10
    r = find_harvest_opportunities(txns, SEC, prices, today=date(2024, 6, 1))
    assert r['lot_count'] == 0


def test_sold_position_not_reported():
    # Fully sold → no open lot to harvest.
    txns = [_buy('sec1', 10, 100, '2020-01-01'), _sell('sec1', 10, 50, '2023-01-01')]
    prices = {'NVDA': {'current_price': 40.0}}
    r = find_harvest_opportunities(txns, SEC, prices, today=date(2024, 6, 1))
    assert r['lot_count'] == 0


def test_partial_sale_leaves_remaining_lot():
    # Bought 10, sold 6, 4 remain. At $50 vs $100 cost → 4 × -$50 = -$200 loss.
    txns = [_buy('sec1', 10, 100, '2020-01-01'), _sell('sec1', 6, 90, '2023-01-01')]
    prices = {'NVDA': {'current_price': 50.0}}
    r = find_harvest_opportunities(txns, SEC, prices, today=date(2024, 6, 1))
    assert r['lot_count'] == 1
    assert round(r['opportunities'][0]['shares'], 2) == 4.0
    assert round(r['opportunities'][0]['unrealized_loss'], 2) == -200.0


def test_unpriceable_ticker_skipped():
    txns = [_buy('sec1', 10, 100, '2020-01-01')]
    r = find_harvest_opportunities(txns, SEC, {}, today=date(2024, 6, 1))  # no price
    assert r['lot_count'] == 0


if __name__ == '__main__':
    fns = [v for k, v in sorted(globals().items()) if k.startswith('test_') and callable(v)]
    for fn in fns:
        fn()
        print(f"  [pass] {fn.__name__}")
    print(f"All {len(fns)} tax-loss tests passed!")
