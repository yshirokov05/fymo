"""
Tests for realized_gains_service.compute_realized_gains — FIFO lot matching.

These guard the capital-gains math that feeds both the Investments tab and the
tax projection. Getting ST vs LT classification or lot ordering wrong shows
users incorrect tax numbers. Run: `pytest` or `python test_realized_gains.py`.
"""
from datetime import date
from realized_gains_service import compute_realized_gains


def _buy(sec, qty, price, d, acct='a1'):
    return {'security_id': sec, 'type': 'buy', 'quantity': qty,
            'amount': qty * price, 'price': price, 'date': d, 'account_id': acct}


def _sell(sec, qty, price, d, acct='a1'):
    return {'security_id': sec, 'type': 'sell', 'quantity': qty,
            'amount': qty * price, 'price': price, 'date': d, 'account_id': acct}


SEC = {'sec1': {'ticker_symbol': 'AAPL'}}


def test_long_term_gain():
    # Buy 10 @ $100 (2020), sell 10 @ $150 (2024) → held >1yr → $500 LT gain.
    txns = [_buy('sec1', 10, 100, '2020-01-01'), _sell('sec1', 10, 150, '2024-01-01')]
    r = compute_realized_gains(txns, SEC, today=date(2024, 6, 1))
    assert r['sell_count'] == 1
    assert round(r['total_realized'], 2) == 500.0
    assert round(r['total_lt'], 2) == 500.0
    assert round(r['total_st'], 2) == 0.0


def test_short_term_gain():
    # Held 183 days (<365) → short-term.
    txns = [_buy('sec1', 5, 100, '2023-06-01'), _sell('sec1', 5, 120, '2023-12-01')]
    r = compute_realized_gains(txns, SEC, today=date(2024, 1, 1))
    assert round(r['total_st'], 2) == 100.0
    assert round(r['total_lt'], 2) == 0.0


def test_realized_loss_is_negative():
    txns = [_buy('sec1', 10, 100, '2020-01-01'), _sell('sec1', 10, 60, '2024-01-01')]
    r = compute_realized_gains(txns, SEC, today=date(2024, 6, 1))
    assert round(r['total_realized'], 2) == -400.0
    assert round(r['total_lt'], 2) == -400.0


def test_fifo_consumes_oldest_lots_first():
    # Two lots: 10 @ $100 (old, LT) then 10 @ $200 (recent, ST). Sell 15 @ $250.
    # FIFO: 10 from lot1 (cost 1000) + 5 from lot2 (cost 1000) = cost 2000.
    # Proceeds 15 × 250 = 3750. Total gain 1750. Lot1 portion is LT, lot2 portion ST.
    txns = [
        _buy('sec1', 10, 100, '2020-01-01'),
        _buy('sec1', 10, 200, '2023-12-01'),
        _sell('sec1', 15, 250, '2024-01-15'),
    ]
    r = compute_realized_gains(txns, SEC, today=date(2024, 6, 1))
    assert round(r['total_realized'], 2) == 1750.0
    # Lot1: 10 × (250-100) = 1500 LT.  Lot2: 5 × (250-200) = 250 ST.
    assert round(r['total_lt'], 2) == 1500.0
    assert round(r['total_st'], 2) == 250.0


def test_unmatched_sell_is_flagged():
    # Sell with no prior buy (e.g. transferred-in shares) → counted but unmatched.
    txns = [_sell('sec1', 5, 100, '2024-01-01')]
    r = compute_realized_gains(txns, SEC, today=date(2024, 6, 1))
    assert r['sell_count'] == 1
    assert r['unmatched_count'] == 1
    assert round(r['unmatched_proceeds'], 2) == 500.0


def test_by_year_breakdown():
    txns = [
        _buy('sec1', 10, 100, '2020-01-01'),
        _sell('sec1', 5, 150, '2023-03-01'),
        _sell('sec1', 5, 160, '2024-03-01'),
    ]
    r = compute_realized_gains(txns, SEC, today=date(2024, 6, 1))
    assert round(r['by_year']['2023']['total'], 2) == 250.0   # 5 × (150-100)
    assert round(r['by_year']['2024']['total'], 2) == 300.0   # 5 × (160-100)


def test_no_transactions_is_empty():
    r = compute_realized_gains([], SEC, today=date(2024, 6, 1))
    assert r['sell_count'] == 0
    assert r['total_realized'] == 0.0


if __name__ == '__main__':
    fns = [v for k, v in sorted(globals().items()) if k.startswith('test_') and callable(v)]
    for fn in fns:
        fn()
        print(f"  [pass] {fn.__name__}")
    print(f"All {len(fns)} realized-gains tests passed!")
