# User-Facing Issues & Bug Tracker — Fymo

**Last updated:** 2026-04-28
**Version:** v1.5.0

Track of bugs reported or discovered that affect real users. See SECURITY_REVIEW.md for security-specific issues.

---

## Status Key
- ✅ **FIXED** — shipped to production
- 🔴 **OPEN** — confirmed bug, not yet fixed
- 🟡 **KNOWN** — acknowledged, deferred

---

## Fixed Issues

### UX-1 — Demo Mode: "Cannot create goal" generic error ✅ FIXED (v1.5.0)
**Reported:** User testing demo mode
**Problem:** Guest users clicking "New Goal" got a red error banner saying "Failed to create goal." The backend correctly rejected with 401 + a friendly message, but the frontend catch block showed a generic string.
**Fix:** `Goals.js` `handleAdd` now detects `err.response?.status === 401` and renders a blue CTA: "Create an account to save goals" with a "Sign Up Free" button. Button dispatches `fymo:open-auth` event; `App.js` listener resets guest state → LandingPage. `NewGoalForm` is dismissed on 401.

---

### UX-2 — "Wealthstack" brand name showing on landing page after rename ✅ FIXED
**Reported:** User (post-deploy inspection)
**Problem:** LandingPage.js used a split-span pattern `Wealth<span className="text-blue-400">stack</span>` in 3 places (navbar logo, hero, footer). Simple `replace_all` on "Wealthstack" missed these. Brand appeared as "Wealthstack" even after other files were updated to "Fymo".
**Fix:** Targeted replace of the full JSX split-span string to `Fy<span className="text-blue-400">mo</span>`.

---

### UX-3 — Tax tab 500 crash for all users ✅ FIXED
**Problem:** `FilingStatus` and `USState` enums used in `update_user_tax_info` but not imported in `api.py`. Any user saving tax info got a Python `NameError` returning a 500 with raw traceback.
**Fix:** Added both enums to the import statement in `api.py`.

---

### UX-4 — New users permanently locked out of Plaid/AI with no explanation ✅ FIXED
**Problem:** No self-service authorization path. New users got 403s from all Plaid endpoints with no actionable message.
**Fix:** Stripe billing live ($9.99/mo). Onboarding flow explains Premium. Settings → Upgrade shows Stripe checkout. Webhook sets `is_subscribed: true`.

---

### UX-5 — Subscription portal 404 in Stripe ✅ FIXED
**Problem:** Stripe Customer Portal not activated, causing 404 when users tried to manage subscriptions.
**Fix:** Customer Portal activated at `dashboard.stripe.com/settings/billing/portal`. Business name set to "Fymo".

---

### UX-6 — Login broken after projectfymo.com domain added ✅ FIXED
**Problem:** Firebase Auth's authorized domains list didn't include `projectfymo.com` or `www.projectfymo.com`. Login flow redirected to Firebase-hosted auth page, which then failed.
**Fix:** Both domains added to Firebase Auth → Settings → Authorized domains.

---

### UX-7 — `console.log` appearing in production Budgeting component ✅ FIXED
**Problem:** `console.log("Dismissing subscription:", s.name)` left in `Budgeting.js` production code.
**Fix:** Removed.

---

### UX-8 — Category Rules: Bidirectional substring match caused false positives ✅ FIXED (v1.5.0)
**Severity:** HIGH — silent miscategorization
**Problem:** Match logic in `categorize_transaction()` and the 3 `/api/custom_rules` routes used `pattern in name OR name in pattern`. The second arm caused long rule patterns (e.g. "STARBUCKS STORE #5512 SEATTLE") to match every transaction containing the substring "STARBUCKS" — including unrelated short names — because any short transaction name is contained within a long pattern.
**Fix:** Dropped the second arm everywhere. Match is now one-way: pattern must be contained in transaction name. Updated in `plaid_service.py:127`, `api.py:get_custom_rules`, `api.py:create_custom_rule`, `api.py:update_custom_rule`.

---

### UX-9 — Category Rules: No conflict resolution between overlapping rules ✅ FIXED (v1.5.0)
**Problem:** When two rules could both match a transaction (e.g. "STARBUCKS" and "STARBUCKS RESERVE"), iteration order won — non-deterministic from a user's perspective.
**Fix:** `categorize_transaction()` now sorts rules by pattern length DESC before matching, so more specific rules always win.

---

### UX-10 — Category Rules: No cap on rule count ✅ FIXED (v1.5.0)
**Problem:** Users could create unlimited rules. Each rule is checked against every transaction on every Plaid sync — performance degrades linearly. A user with 500 rules and 500 transactions = 250k comparisons per sync.
**Fix:** Soft cap of 100 rules per user, enforced in backend (400 response) and frontend (Add button disabled with tooltip when at cap).

---

### UX-15 — Tax Projection: Capital gains integration (Phase C+D) ✅ ADDED (v1.5.0)
**Severity:** FEATURE — closes the realized gains feature loop into actual tax math
**Implementation:**

Phase C — Tax engine integration:
- Added LTCG_BRACKETS to `tax_logic.py` (2025 IRS published, 2026 inflation-estimated)
- Added `calculate_ltcg_tax(ltcg, ordinary_taxable_income, filing_status, year)` — handles bracket-stacking correctly when LTCG straddles the 0/15/20% boundaries. 6 unit-tested scenarios.
- `calculations.py`: pulls realized_gains from `user.investment_history`, computes per-calendar-year ST/LT split via `_realized_gains_for_year()` helper
- ST gains added to ordinary income (federal), LT gains taxed separately at preferential rates
- State tax: ST + LT both taxed as ordinary income (CA + most states)
- Backwards-compatible: zero realized data → zero impact on tax estimate

Phase C frontend — Tax Projection card:
- Show Math panel now displays realized gains as ordinary-income additions
- Federal tax row splits into "Federal (ordinary income)" + "Federal (long-term cap gains)" when LTCG > 0
- Formula text adapts to mention LTCG when applicable

Phase D — Income tab:
- New "Realized Gains" card appears in the YTD summary row when realized data exists
- Shows total + LT/ST split, color-coded
- Added to `totalIncomeYTD` aggregate

Backend additions (realized_gains_service.py):
- New `by_year` per-calendar-year aggregation alongside the existing periods (ytd/1y/etc)
- More accurate for tax-year breakdown (vs trailing-window periods)
- Aggregated across institutions in `api.py` plaid_sync merge

Known limitations:
- Net Investment Income Tax (NIIT 3.8% above thresholds) not yet applied
- Capital loss carryforward ($3k/yr against ordinary income) not modeled
- Wash-sale rule detection not implemented

### UX-14 — Portfolio Return: Per-ticker realized gains view + Total Profit summary ✅ ADDED (v1.5.0)
**Severity:** FEATURE — Phase A.5 + Phase B of realized gains rollout
**Implementation:**
- New `RealizedGainsTable.js` component, surfaced on the Investments tab
- Collapsible card showing total realized + ST/LT split + sell count
- Per-ticker table sorted by absolute gain magnitude
- Each ticker row expandable to show individual sells with date, shares, proceeds, cost basis, and ST/LT split
- Unmatched sells flagged with asterisk + tooltip
- Methodology note explains FIFO and 5y lookback limit

**Phase B addition:** When "All" period is selected on the Dashboard's Portfolio Return card, an additional "Total Profit (All-Time)" line shows the combined unrealized + realized + dividends. This addresses the original concern that cost-basis-only "All-Time Unrealized" is misleading for active traders — the new line gives an honest "how much has this portfolio made me overall" dollar figure.

### UX-13 — Portfolio Return: Realized capital gains tracking ✅ ADDED (v1.5.0)
**Severity:** FEATURE — fills a major gap in portfolio analytics
**Reported:** User asking about long-term vs short-term gains, sale-of-stock income
**Problem:** Plaid's `cost_basis` field on holdings only reflects current positions and gets distorted by lot consolidation and dividend reinvestment. We had no way to see actual realized gains on past sales, no ST/LT split, and no per-ticker realized history.

**Implementation:**
- New `backend/realized_gains_service.py` — pure FIFO lot matcher
- Walks the same 5y Plaid transaction ledger; for each sell, pops oldest matching buy lots
- Classifies each lot: held ≥365 days = long-term, else short-term
- Tracks unmatched sells (transferred-in shares or pre-5y purchases) separately
- Hooked into `plaid_service.sync_plaid_data` → returned in `inv_history.realized_gains`
- Aggregated across multiple Plaid items in `api.py` plaid_sync merge step
- Persisted via existing `investment_history` Firestore write path

**Display:** Below the "net activity" line on the Portfolio Return card, shows:
- Total realized $ for selected period (color-coded gain/loss)
- ST and LT breakdown when both nonzero
- Tooltip explaining FIFO methodology and unmatched-sell caveats

Tested with 6 scenarios: simple LT gain, ST loss, partial match (sell > buy), multi-lot FIFO ordering, empty input, cash-like ticker filtering.

### UX-12 — Portfolio Return: Period selector silently fell back to All-Time + ignored cash flows ✅ FIXED (v1.5.0)
**Severity:** HIGH — misleading data on a primary dashboard metric
**Reported:** User testing 2026-04-28
**Problems:**
1. **Silent fallback:** When user clicked YTD/1Y/etc. and the backend couldn't compute a return for that period, the headline silently switched to "All-Time Return" while the period pill stayed highlighted. Confusing — users expected the headline to match their selection.
2. **Naive math:** All three calculation tiers (ledger reconstruction, snapshot fallback, value-weighted ticker average) used `(end - start) / start * 100`, which treats deposits during the period as performance. A user who deposited $25k mid-period saw inflated returns; conversely, withdrawals deflated them.
3. **Cost-basis "All-Time Return":** Used Plaid-reported cost basis on current holdings, which reflects average cost-per-share *after* lot averaging and dividend reinvestment — NOT total cash invested. For active traders this number is small and conceptually misleading.

**Fixes:**
1. Frontend now shows explicit "N/A — {period} unavailable" when backend can't compute, with a "See all-time return →" CTA. No more silent fallback.
2. Backend TIER 1 (ledger) and TIER 3 (snapshot) now use **Modified Dietz**: `(end - start - net_flow) / (start + 0.5 × net_flow)` where `net_flow = invested − proceeds − dividends`. Deposits/withdrawals during the period no longer count as performance.
3. All-Time label changed to "All-Time Unrealized" with an explicit tooltip clarifying it's unrealized gain on current holdings vs cost basis, NOT period-over-period return.

### UX-11 — Category Rules: Hardcoded category list duplicated in 3 places ✅ FIXED (v1.5.0)
**Problem:** `CategoryRulesManager.js` hardcoded `ALL_CATEGORIES` that had to stay in sync with `Budgeting.js` and `category_mapping.json` manually.
**Fix:** Now fetches the canonical list from `/api/config/categories` on mount. Falls back to a hardcoded list only if the endpoint fails.

---

## Open Issues

### BUG-1 — `remove_institution` Wipes ALL Plaid Data (Not Just Removed Bank) 🔴 OPEN
**Severity:** HIGH — data loss
**Who it affects:** Any user with 2+ linked banks who disconnects one
**Problem:** `POST /api/remove_institution` filters `assets` to non-Plaid only and sets `transactions = []` — clearing data from ALL institutions, not just the one being removed.
**Fix needed:** Filter by `plaid_item_id` (available in `PlaidItem` model) rather than nuking all Plaid records.

---

### BUG-2 — Debt Plaid Account ID Not Persisted → Duplicates After 2nd Sync 🔴 OPEN
**Severity:** HIGH — data integrity
**Who it affects:** All Plaid users with synced debts (credit cards, mortgages, etc.)
**Problem:** `firestore_db.py` save path omits `plaid_account_id` from debt objects. After first sync+save, IDs are gone. Second sync can't deduplicate by ID, falls back to name match. Name changes = duplicates created silently.
**Fix needed:** Add `plaid_account_id` to debt serialization/deserialization in `firestore_db.py`.

---

### BUG-3 — `remove_institution` Skips Authorization Check 🔴 OPEN
**Severity:** HIGH — access control
**Problem:** All Plaid endpoints require `is_user_authorized()` except `POST /api/remove_institution`, which only has `@token_required`. Any authenticated free user can call it.
**Fix needed:** Add `is_user_authorized()` guard matching other Plaid routes.

---

### BUG-4 — Raw Python Exceptions Returned to Client in Error Responses 🔴 OPEN
**Severity:** MEDIUM — info leak
**Problem:** Many routes return `jsonify({'error': str(e)})` on exception, leaking Plaid API error bodies, internal module paths, and service URLs.
**Fix needed:** Catch + log full exception server-side; return generic message to client.

---

## Deferred / Known

### KNOWN-1 — N+1 Synchronous yfinance Calls 🟡 DEFERRED (Phase 7+)
Users with 30+ assets experience 6–15s load times on dashboard. Each asset makes one sequential yfinance HTTP call. No deduplication, no caching.
**Plan:** ThreadPoolExecutor for parallel fetching + 5-min in-memory cache keyed by ticker.

### KNOWN-2 — No Firestore Atomic Writes (Race Conditions) 🟡 DEFERRED (Phase 7+)
Concurrent Plaid sync + portfolio edit results in last-write-wins data loss. Firestore transactions not used.
**Plan:** Wrap `plaid_sync` in `@firestore.transactional`.

### KNOWN-3 — assets/debts/incomes Still in Root Firestore Document 🟡 DEFERRED (Phase 7)
Transactions and paystubs moved to subcollections. Core financial arrays still in root doc. Large power users with many manual assets can approach 1MB.
**Plan:** Migrate to subcollections in Phase 7.

### KNOWN-4 — SQLAlchemy Dead Dependency 🟡 DEFERRED
`models.py` uses SQLAlchemy ORM syntax but never connects an engine. Adds ~15MB to deploy for zero benefit.
**Plan:** Convert to Python dataclasses in Phase 7 refactor.

### KNOWN-5 — Display Names Stale in Firebase/Analytics Console 🟡 COSMETIC
Firebase project display name, GA4 property name, and GA4 stream name still show old names from before the Fymo rebrand. Cosmetic only — no user impact.
