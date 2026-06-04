"""
backfill_service — one-time reconstruction of historical daily portfolio value.

WHY
────
Period returns (1W / 1M / YTD / 1Y) need the portfolio's market value at the START
of each period. Fymo only began recording accurate daily snapshots recently, so
without a backfill the user waits ~30 days for a 1M number and until January for YTD.

METHOD
──────
This rebuilds the same daily value series a custodian (Vanguard, Fidelity) keeps —
reconstructed from data the user already has:

    value(day) = Σ_ticker  shares_held(ticker, day) × close_price(ticker, day)

where:
  • shares_held comes from the Plaid investment-transaction ledger, ANCHORED to the
    user's CURRENT holdings and walked BACKWARDS. Anchoring to today (which we know
    exactly) and subtracting later buys / adding back later sells means shares that
    were transferred in from another brokerage — and so have no "buy" record — are
    correctly treated as held for the whole window, instead of materializing from zero.
  • close_price comes from yfinance daily history (price_service.get_price_history),
    which has full daily history for listed tickers (incl. thin small-caps).

LIMITATIONS (these make backfilled days ESTIMATES — flagged source='backfill';
going-forward source='live' snapshots are exact and always take precedence)
  • Plaid's ledger goes back 5 years and omits transferred-in buy history, so days
    before a position's earliest known txn assume the current share count.
  • Options and delisted tickers have no yfinance history → they contribute $0 to
    reconstructed days (understated). Live snapshots capture them correctly.
  • Reconstructed % won't tie out to the penny against the custodian — it's a close,
    directionally-correct estimate that real snapshots replace over time.

Runs once per user (guarded by the `snapshots_backfilled` flag on the user doc),
invoked from plaid_service.sync_plaid_data where the transaction ledger is in scope.
Best-effort: any failure is swallowed so it can never break a sync.
"""

import logging
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

# Reuse the canonical txn-date parser, cash-equivalent list, and option detector
# so this stays in lock-step with the realized-gains engine.
from realized_gains_service import _to_date, CASH_LIKE_TICKERS, is_option_symbol

# Asset types that are NOT market-traded investments — excluded from the portfolio
# value series (matches take_portfolio_snapshot in api.py).
_LIQUID_OR_FIXED_TYPES = {'CASH', 'SAVINGS', 'CHECKING', 'HIGH_YIELD_SAVINGS', 'HOUSING'}

# How far back to reconstruct, and how many recent days to leave to live snapshots.
_BACKFILL_DAYS = 400
_RECENT_SKIP_DAYS = 2  # don't overwrite the last ~2 days — those are live/near-live


# ─────────────────────────────────────────────────────────────────────────────
# PURE reconstruction core (no I/O — unit-tested in test_backfill.py)
# ─────────────────────────────────────────────────────────────────────────────
def reconstruct_daily_values(current_shares, signed_txns, histories, today,
                             days=_BACKFILL_DAYS, recent_skip=_RECENT_SKIP_DAYS):
    """Reconstruct {date_str: portfolio_value} over the trailing `days` window.

    Args:
        current_shares: {ticker: shares_held_now}
        signed_txns:    list[(date_str, ticker, signed_qty)] — +buy / −sell
        histories:      {ticker: {date_str: close_price}}
        today:          date — anchor (the share counts are as of this date)
        days:           lookback window length
        recent_skip:    leave the last N days to live snapshots (don't reconstruct)

    Returns dict {date_str: value} for days with a positive reconstructed value.
    The share walk: value(D) uses holdings at the CLOSE of day D, i.e.
    current_shares minus the net of every txn dated strictly AFTER D.
    """
    all_dates = set()
    for h in histories.values():
        all_dates.update(h.keys())
    if not all_dates:
        return {}

    cutoff_old = (today - timedelta(days=days)).strftime('%Y-%m-%d')
    cutoff_recent = (today - timedelta(days=recent_skip)).strftime('%Y-%m-%d')
    dates_desc = sorted(d for d in all_dates if cutoff_old <= d <= cutoff_recent)
    dates_desc.reverse()  # newest → oldest
    if not dates_desc:
        return {}

    shares = dict(current_shares)
    txns_desc = sorted(signed_txns, key=lambda x: x[0], reverse=True)  # by date desc
    ti = 0
    last_price = {}  # carry a ticker's most-recent seen close across small gaps
    out = {}
    for dstr in dates_desc:
        # Reverse every txn dated strictly AFTER this day, so `shares` reflects the
        # holdings at the close of `dstr`. Reversing a buy subtracts its qty;
        # reversing a sell adds it back (signed_qty already encodes the sign).
        while ti < len(txns_desc) and txns_desc[ti][0] > dstr:
            _, tk, signed = txns_desc[ti]
            shares[tk] = shares.get(tk, 0.0) - signed
            ti += 1

        value = 0.0
        for tk, sh in shares.items():
            if sh <= 1e-9:
                continue
            price = histories.get(tk, {}).get(dstr)
            if price is None:
                price = last_price.get(tk)  # best-effort gap fill
            else:
                last_price[tk] = price
            if price:
                value += sh * price
        if value > 0:
            out[dstr] = round(value, 2)
    return out


def build_signed_txns(inv_txns, inv_sec_map):
    """Flatten Plaid investment txns → [(date_str, ticker, signed_qty)] + ticker set.
    +qty for buys, −qty for sells; cash-equivalents skipped."""
    txns = []
    tickers = set()
    for t in (inv_txns or []):
        sec_id = t.get('security_id')
        if not sec_id:
            continue
        sec = (inv_sec_map or {}).get(sec_id) or {}
        ticker = (sec.get('ticker_symbol') or '').upper().strip()
        if not ticker or ticker in CASH_LIKE_TICKERS:
            continue
        ttype = (t.get('type') or '').lower()
        stype = (t.get('subtype') or '').lower()
        is_buy = ttype == 'buy' or stype == 'buy'
        is_sell = ttype == 'sell' or stype == 'sell'
        if not (is_buy or is_sell):
            continue
        qty = abs(float(t.get('quantity') or 0))
        if qty < 1e-9:
            continue
        d = _to_date(t.get('date'))
        if not d:
            continue
        txns.append((d.strftime('%Y-%m-%d'), ticker, qty if is_buy else -qty))
        tickers.add(ticker)
    return txns, tickers


def build_current_shares(assets):
    """{ticker: shares} for current market-traded holdings (cash/housing excluded)."""
    current = {}
    for a in (assets or []):
        try:
            tk = (a.ticker or '').upper().strip()
            if not tk or tk in CASH_LIKE_TICKERS:
                continue
            if a.asset_type.name in _LIQUID_OR_FIXED_TYPES:
                continue
            current[tk] = current.get(tk, 0.0) + float(a.shares or 0)
        except Exception:
            continue
    return current


# ─────────────────────────────────────────────────────────────────────────────
# I/O orchestration
# ─────────────────────────────────────────────────────────────────────────────
def backfill_snapshots(user_id, assets, inv_txns, inv_sec_map, force=False):
    """Reconstruct and persist historical daily portfolio snapshots for `user_id`.

    Args:
        user_id:     Firestore user id (skips guests).
        assets:      list[Asset] — current holdings (anchors the share walk).
        inv_txns:    list[dict]  — Plaid investment transactions.
        inv_sec_map: dict[security_id] -> security dict (carries ticker_symbol).
        force:       re-run even if already backfilled.

    Returns the number of snapshot days written (0 on skip/failure).
    """
    if not user_id or user_id == 'guest':
        return 0

    try:
        from firestore_db import get_db
        from firebase_admin import firestore
        from price_service import get_price_history
    except Exception as e:
        logging.warning(f"[backfill] imports unavailable: {e}")
        return 0

    db = get_db()
    if not db:
        return 0

    user_ref = db.collection('users').document(user_id)

    # ── Run-once guard ──────────────────────────────────────────────────────
    if not force:
        try:
            snap = user_ref.get()
            if snap.exists and (snap.to_dict() or {}).get('snapshots_backfilled'):
                logging.info(f"[backfill] {user_id}: already backfilled — skipping")
                return 0
        except Exception:
            pass  # if the read fails, proceed — worst case we re-backfill once

    signed_txns, txn_tickers = build_signed_txns(inv_txns, inv_sec_map)
    current_shares = build_current_shares(assets)
    tickers = txn_tickers | set(current_shares.keys())

    if not tickers:
        logging.info(f"[backfill] {user_id}: no investment tickers — nothing to reconstruct")
        _mark_done(user_ref, firestore)  # cash-only user — don't retry every sync
        return 0

    # ── Fetch daily price history per ticker (parallel) ─────────────────────
    # Options have no yfinance history → skip the fetch (they'd contribute $0 anyway).
    fetch_tickers = [t for t in tickers if not is_option_symbol(t)]
    histories = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(get_price_history, t, _BACKFILL_DAYS): t for t in fetch_tickers}
        for f in as_completed(futs):
            tk = futs[f]
            try:
                histories[tk] = f.result(timeout=25) or {}
            except Exception:
                histories[tk] = {}

    if not any(histories.values()):
        logging.warning(f"[backfill] {user_id}: no price history for any ticker — aborting (will retry next sync)")
        return 0

    today = datetime.utcnow().date()
    reconstructed = reconstruct_daily_values(current_shares, signed_txns, histories, today)
    if not reconstructed:
        logging.warning(f"[backfill] {user_id}: reconstruction produced no positive days")
        return 0

    # ── Accuracy diagnostics ────────────────────────────────────────────────
    # Logged (grep `[backfill-diag]`) so we can verify reconstruction against
    # reality instead of asking the user to eyeball it. The key signal is `ratio`:
    # reconstructing the most-recent day from shares×historical-price should be
    # within a couple % of the user's actual current holdings value. A large gap
    # (or any 'transfer' txns / no-price tickers) tells us exactly where to fix.
    _log_accuracy_diag(user_id, inv_txns, current_shares, histories, reconstructed)

    # Dates that already have an EXACT (live) snapshot — never overwrite those.
    live_dates = set()
    try:
        existing = user_ref.collection('portfolio_snapshots').get()
        for doc in existing:
            if (doc.to_dict() or {}).get('source') == 'live':
                live_dates.add(doc.id)
    except Exception:
        pass

    # ── Persist (batched), skipping days that already have a live snapshot ──
    coll = user_ref.collection('portfolio_snapshots')
    written = 0
    batch = db.batch()
    n = 0
    for dstr, value in reconstructed.items():
        if dstr in live_dates:
            continue
        batch.set(coll.document(dstr), {
            'date': dstr,
            'total_value': value,
            'source': 'backfill',
            'timestamp': firestore.SERVER_TIMESTAMP,
        }, merge=True)
        n += 1
        written += 1
        if n >= 450:  # Firestore batch cap is 500 ops
            batch.commit()
            batch = db.batch()
            n = 0
    if n > 0:
        batch.commit()

    _mark_done(user_ref, firestore)
    logging.info(
        f"[backfill] {user_id}: wrote {written} reconstructed snapshots "
        f"({len(fetch_tickers)} tickers, {len(signed_txns)} txns, {len(live_dates)} live days preserved)"
    )
    return written


def _log_accuracy_diag(user_id, inv_txns, current_shares, histories, reconstructed):
    """Emit a structured accuracy report to the logs (best-effort, never raises).

    This is the verification loop: after a sync, these lines reveal the real shape
    of the user's data — which txn types exist, whether transferred-in positions are
    present, which tickers lack historical prices, and how close a reconstructed
    recent day is to the actual current holdings value (`ratio` ≈ 1.0 = sound)."""
    try:
        from collections import Counter
        type_counts = Counter()
        transfer_count = 0
        for t in (inv_txns or []):
            ty = (t.get('type') or '').lower()
            st = (t.get('subtype') or '').lower()
            type_counts[ty or st or 'unknown'] += 1
            if 'transfer' in ty or 'transfer' in st:
                transfer_count += 1

        latest_price = {}
        for tk, h in histories.items():
            if h:
                latest_price[tk] = h[max(h.keys())]

        current_value_est = sum(sh * latest_price.get(tk, 0.0) for tk, sh in current_shares.items())
        no_price = [tk for tk, sh in current_shares.items() if sh > 1e-9 and not latest_price.get(tk)]
        recon_latest_date = max(reconstructed.keys()) if reconstructed else None
        recon_latest_val = reconstructed.get(recon_latest_date, 0.0) if recon_latest_date else 0.0
        ratio = (recon_latest_val / current_value_est) if current_value_est else 0.0

        logging.info(
            f"[backfill-diag] {user_id}: txn_types={dict(type_counts)} transfers={transfer_count} | "
            f"current_holdings_est=${current_value_est:,.0f} "
            f"recon_latest({recon_latest_date})=${recon_latest_val:,.0f} ratio={ratio:.3f} | "
            f"no_price_tickers={no_price}"
        )
        for tk in sorted(current_shares):
            logging.info(
                f"[backfill-diag] {user_id}:   {tk}: shares={current_shares[tk]:.4f} "
                f"latest_price=${latest_price.get(tk, 0.0):.2f}"
            )
    except Exception as e:
        logging.warning(f"[backfill-diag] {user_id}: diagnostics failed: {e}")


def _mark_done(user_ref, firestore):
    """Set the run-once flag so we don't re-backfill on every sync."""
    try:
        user_ref.set({
            'snapshots_backfilled': True,
            'snapshots_backfilled_at': firestore.SERVER_TIMESTAMP,
        }, merge=True)
    except Exception as e:
        logging.warning(f"[backfill] could not set done flag: {e}")
