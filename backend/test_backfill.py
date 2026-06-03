"""
Tests for backfill_service — historical daily portfolio-value reconstruction.

These cover the PURE share-walk (reconstruct_daily_values) and the Plaid-ledger
flatteners (build_signed_txns / build_current_shares). A regression here = wrong
historical portfolio values → wrong 1M/YTD/1Y returns shown to users, so failures
must BLOCK the deploy. No network, no Firestore. Run: `python test_backfill.py`.

The walk's invariant: value(D) uses holdings at the CLOSE of day D = current
shares minus the net of every txn dated strictly AFTER D.
"""
from datetime import date
from backfill_service import (
    reconstruct_daily_values, build_signed_txns, build_current_shares,
)

TODAY = date(2026, 6, 1)


# ── PURE share-walk: basic multi-position reconstruction ──────────────────────
def test_basic_reconstruction_share_counts():
    # Now: 100 FOO (60 bought 01-15, 40 bought 05-20), 10 BAR (bought 05-25).
    current = {'FOO': 100.0, 'BAR': 10.0}
    txns = [
        ('2026-01-15', 'FOO', 60.0),
        ('2026-05-20', 'FOO', 40.0),
        ('2026-05-25', 'BAR', 10.0),
    ]
    price = lambda dates, p: {d: p for d in dates}
    dates = ['2026-01-10', '2026-03-01', '2026-05-22', '2026-05-28', '2026-05-29']
    histories = {'FOO': price(dates, 10.0), 'BAR': price(dates, 50.0)}

    out = reconstruct_daily_values(current, txns, histories, TODAY)

    # 05-29 / 05-28: both FOO buys + BAR buy are in the past → 100*10 + 10*50 = 1500
    assert out['2026-05-29'] == 1500.0, out
    assert out['2026-05-28'] == 1500.0, out
    # 05-22: BAR not yet bought (05-25 is after) → 100*10 = 1000
    assert out['2026-05-22'] == 1000.0, out
    # 03-01: only the 01-15 FOO lot held (05-20 buy is after) → 60*10 = 600
    assert out['2026-03-01'] == 600.0, out
    # 01-10: nothing held yet (first buy is 01-15) → excluded (value 0)
    assert '2026-01-10' not in out, out


# ── Transferred-in shares (no buy record) are held flat the whole window ───────
def test_transferred_in_held_flat():
    # 50 shares of XFER currently held, but NO transactions for it (transferred in
    # from another brokerage). It must appear at 50 shares on every reconstructed day.
    current = {'XFER': 50.0}
    txns = []  # no buy/sell history
    dates = ['2026-01-10', '2026-03-01', '2026-05-28']
    histories = {'XFER': {d: 20.0 for d in dates}}

    out = reconstruct_daily_values(current, txns, histories, TODAY)

    assert out['2026-01-10'] == 1000.0, out  # 50 * 20, even on the oldest day
    assert out['2026-03-01'] == 1000.0, out
    assert out['2026-05-28'] == 1000.0, out


# ── Fully-sold position: present before the sale, gone after (sell reversal) ───
def test_sold_position_reversal():
    # Bought 30 SOLD on 01-15, sold all 30 on 04-01. Currently hold 0.
    current = {}  # not in current holdings anymore
    txns = [
        ('2026-01-15', 'SOLD', 30.0),
        ('2026-04-01', 'SOLD', -30.0),
    ]
    dates = ['2026-02-01', '2026-05-01']
    histories = {'SOLD': {d: 5.0 for d in dates}}

    out = reconstruct_daily_values(current, txns, histories, TODAY)

    # 02-01: after buy, before sell → held 30 → 150
    assert out['2026-02-01'] == 150.0, out
    # 05-01: after the sale → held 0 → excluded
    assert '2026-05-01' not in out, out


# ── Recent days are left to live snapshots (recent_skip) ──────────────────────
def test_recent_days_skipped():
    current = {'FOO': 10.0}
    txns = []
    # today = 06-01, recent_skip default = 2 → cutoff is 05-30; 05-31 & 06-01 skipped.
    histories = {'FOO': {'2026-05-29': 10.0, '2026-05-31': 10.0, '2026-06-01': 10.0}}

    out = reconstruct_daily_values(current, txns, histories, TODAY)

    assert '2026-05-29' in out, out
    assert '2026-05-31' not in out, out  # within recent-skip window
    assert '2026-06-01' not in out, out


# ── Missing price on a day carries forward the last seen close (gap fill) ──────
def test_price_gap_carry_forward():
    current = {'FOO': 10.0}
    txns = []
    # FOO missing on 03-01 but present on a newer day → uses carried price.
    histories = {'FOO': {'2026-05-28': 12.0, '2026-03-01': None, '2026-02-01': 11.0}}
    # Drop the None so the date still appears in the union via another ticker:
    histories['FOO'] = {'2026-05-28': 12.0, '2026-02-01': 11.0}
    histories['BAR'] = {'2026-03-01': 99.0}  # forces 03-01 into the date union

    out = reconstruct_daily_values(current, txns, histories, TODAY)

    # On 03-01 FOO has no price; walking newest→oldest the last seen FOO close is
    # 05-28's 12.0 → 10 * 12 = 120. (BAR contributes 0 — not in current_shares.)
    assert out['2026-03-01'] == 120.0, out
    assert out['2026-05-28'] == 120.0, out
    assert out['2026-02-01'] == 110.0, out  # FOO's own 02-01 close used


def test_empty_inputs():
    assert reconstruct_daily_values({}, [], {}, TODAY) == {}
    assert reconstruct_daily_values({'FOO': 5.0}, [], {}, TODAY) == {}  # no histories


# ── Ledger flatteners ─────────────────────────────────────────────────────────
def test_build_signed_txns_signs_and_filters():
    sec_map = {
        's1': {'ticker_symbol': 'AAPL'},
        's2': {'ticker_symbol': 'MSFT'},
        's3': {'ticker_symbol': 'VMFXX'},  # cash-equivalent → filtered out
    }
    inv_txns = [
        {'security_id': 's1', 'type': 'buy',  'quantity': 10, 'date': '2026-01-05'},
        {'security_id': 's2', 'type': 'sell', 'quantity': 4,  'date': '2026-02-09'},
        {'security_id': 's3', 'type': 'buy',  'quantity': 100, 'date': '2026-02-10'},  # cash → skip
        {'security_id': 's1', 'subtype': 'buy', 'quantity': 0, 'date': '2026-03-01'},  # zero qty → skip
        {'security_id': 's2', 'type': 'dividend', 'quantity': 1, 'date': '2026-03-02'},  # not buy/sell → skip
    ]
    txns, tickers = build_signed_txns(inv_txns, sec_map)

    assert ('2026-01-05', 'AAPL', 10.0) in txns
    assert ('2026-02-09', 'MSFT', -4.0) in txns   # sell is negative
    assert tickers == {'AAPL', 'MSFT'}
    assert len(txns) == 2


def test_build_current_shares_excludes_cash_and_housing():
    class _A:
        def __init__(self, ticker, shares, type_name):
            self.ticker = ticker
            self.shares = shares
            self.asset_type = type('T', (), {'name': type_name})()
    assets = [
        _A('AAPL', 10, 'STOCK'),
        _A('AAPL', 5, 'STOCK'),    # same ticker across accounts → summed
        _A('CASH', 5000, 'CASH'),  # cash → excluded
        _A('HOME', 1, 'HOUSING'),  # housing → excluded
        _A('VMFXX', 100, 'STOCK'), # cash-equivalent ticker → excluded
    ]
    out = build_current_shares(assets)
    assert out == {'AAPL': 15.0}, out


if __name__ == '__main__':
    fns = [v for k, v in sorted(globals().items()) if k.startswith('test_') and callable(v)]
    for fn in fns:
        fn()
        print(f"  [pass] {fn.__name__}")
    print(f"All {len(fns)} backfill tests passed!")
