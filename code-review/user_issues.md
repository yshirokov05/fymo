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
