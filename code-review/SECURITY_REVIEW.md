# Security Review — PerfinLab

**Last updated:** 2026-04-28
**Version:** v1.5.0
**Reviewed by:** Claude Sonnet 4.6

---

## Status Key
- ✅ **FIXED** — resolved in production
- ⚠️ **PARTIAL** — mitigated but not fully resolved
- 🔴 **OPEN** — still present

---

## SECTION 1: SECURITY ISSUES

---

### SEC-1 — `users.json` With Password Hash in Git ✅ FIXED
Password hash + salt for owner account was committed in `276a2c1`. File removed from repo and `.gitignore`d. Password was rotated.

---

### SEC-2 — Plaid Access Tokens Plaintext in Firestore ✅ FIXED
Plaid access tokens are now **Fernet-encrypted (AES-128-CBC)** before writing to Firestore via `firestore_db.py`. Decryption key is injected at runtime via Firebase Secret Manager. Even a raw Firestore export yields encrypted blobs, not usable tokens.

---

### SEC-3 — Guest UID Passes Through All `@token_required` Routes ⚠️ PARTIAL
**Still intentional for demo mode.** `auth.py` sets `uid = "guest"` for missing tokens and allows the request through. Sensitive write endpoints now explicitly check `if uid == "guest": return 401`. Read endpoints intentionally serve demo data to guests. This is by design but requires discipline on every new route — a new write endpoint that forgets the guest check will silently allow unauthenticated writes to the "guest" Firestore document.

**Recommendation:** Add a lint/grep CI check that flags any `@token_required` POST/PUT/DELETE route missing a guest guard.

---

### SEC-4 — CORS Wildcard With `supports_credentials=True` ⚠️ PARTIAL
Status unknown — not audited in this pass. Backend runs on Firebase Functions behind Firebase Hosting rewrites; browser-level CORS is largely irrelevant since all traffic proxies through the same origin. Worth locking down `origins` to `["https://perfinlab.com", "https://personal-finance-app-18cbc.web.app"]` to be explicit.

---

### SEC-5 — Hardcoded Owner Emails in Client-Side Code ✅ FIXED
Removed from `App.js` and `api.py`. Authorization is now purely Firestore-based: `is_subscribed` (Stripe) or `is_authorized` flag, checked by UID only. No emails are shipped in the JS bundle or backend code.

---

### SEC-6 — No Rate Limiting on AI / Plaid Endpoints ✅ FIXED
Rate limiting implemented via a Firestore-based `check_rate_limit(uid, action, limit_per_hour)` pattern:
- AI Analyst: 20/hr
- Goal AI guidance: 15/hr
- Plaid sync: 15/hr
- Morning/Health briefs: per-endpoint limits

No Redis required — Firestore rate-limit counters are written atomically.

---

### SEC-7 — Raw Python Exceptions Returned to Clients 🔴 OPEN
Many routes still return `str(e)` in error responses, leaking Plaid error bodies, internal function names, and service URLs. Not exploitable to execute code, but useful for reconnaissance.

**Fix:** Log full exception server-side, return generic `{'error': 'An unexpected error occurred.'}` to client.

---

### SEC-8 — `/api/health` Leaks Infrastructure Info 🔴 OPEN
Unauthenticated endpoint still exposes `plaid_configured` and `environment` (production/sandbox) in response.

**Fix:** Require auth on `/api/health`, or strip the sensitive fields.

---

### SEC-9 — No Prompt Injection Defense on AI Advisor ⚠️ PARTIAL
User input is sanitized via `_sanitize_for_ai()` before building the system prompt. Financial data is summarized (not raw JSON-dumped). Rate limiting is in place. However, there is no explicit input length cap on `user_prompt` and no formal injection pattern detection.

**Acceptable risk** at current scale. Revisit if AI features are exposed more broadly.

---

## SECTION 2: FUNCTIONAL SECURITY (Multi-User Readiness)

---

### FUNC-1 — FilingStatus / USState Not Imported in api.py ✅ FIXED
Was a `NameError` causing Tax tab to 500 for all users. Fixed — both enums are now imported.

---

### FUNC-2 — No Authorization Path for New Users ✅ FIXED
Stripe billing (live mode, $9.99/mo) is now the primary authorization path. New users can subscribe via the Settings → Upgrade flow. Stripe webhook sets `is_subscribed: true` in Firestore. Whitelisted testers use `is_authorized: true` flag set manually in Firestore.

---

### FUNC-3 — `remove_institution` Wipes All Transactions + Plaid Assets 🔴 OPEN
Still present: removing one linked institution clears ALL Plaid-synced transactions and ALL Plaid assets across all institutions, not just the removed one.

```python
# api.py — remove_institution
assets = [a for a in assets if not a.plaid_account_id]  # wipes ALL Plaid assets
transactions = []                                         # wipes ALL transactions
```

This is a silent, irreversible data loss bug. Any multi-institution user who removes one bank loses everything.

**Fix:** Filter by `plaid_item_id` (or `institution_id`) rather than wiping all Plaid-linked records.

---

### FUNC-4 — Debt `plaid_account_id` Not Persisted → Duplication on Re-sync 🔴 OPEN
`firestore_db.py` save path omits `plaid_account_id` on debts. After the first sync+save cycle, all debts lose their Plaid ID. On the second sync, name-based dedup is the only guard — if Plaid changes a debt's display name, duplicates are created on every subsequent sync.

**Fix:** Add `plaid_account_id` to the debt serialization/deserialization paths.

---

### FUNC-5 — `remove_institution` Skips Authorization Check 🔴 OPEN
`POST /api/remove_institution` has `@token_required` but no `is_user_authorized()` check, unlike all other Plaid endpoints. Any authenticated user can call it.

**Fix:** Add `is_user_authorized()` guard consistent with other Plaid routes.

---

### FUNC-6 — Mutable Default Arguments in `save_user_data` 🔴 OPEN
```python
def save_user_data(..., plaid_items=[], budgets=[], transactions=[], paystubs=[], ...):
```
Python evaluates mutable default args once at definition time. If any call path ever appends to one of these without passing a fresh list, it corrupts the shared default across all future calls. Hasn't fired — callers currently always pass explicit lists — but is a latent bug waiting to surface under refactoring.

**Fix:** Replace defaults with `None` and initialize inside the function body.

---

### FUNC-7 — No Email Verification on Sign-Up ⚠️ PARTIAL
`createUserWithEmailAndPassword` does not send a verification email. Users can register with addresses they don't own. Firebase minimum password is 6 characters with no complexity requirement. Acceptable for a small-scale B2C app; revisit before any compliance requirement.

---

### FUNC-8 — Admin Email Hardcoded in Firestore Security Rules ✅ PARTIAL FIX
`firestore.rules` still has one hardcoded email for the whitelist write rule. The JS bundle and backend no longer expose emails. Firestore rules email is only visible to project owners with Firebase console access — low risk, but worth migrating to a UID-based check.

---

### FUNC-9 — Demo Mode Goal Creation Shows Generic Error ✅ FIXED (v1.5.0)
Demo (guest) users attempting to create a goal received a generic "Failed to create goal" error. Backend correctly returned 401 + friendly message but frontend's catch block swallowed it.

**Fix shipped:** `Goals.js` now detects `err.response?.status === 401` and renders a blue "Create an account to save goals" CTA with a "Sign Up Free" button that dismisses guest mode and returns to the landing page.

---

## Priority List: Open Issues by Urgency

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 1 | FUNC-3 — remove_institution wipes all data | 🔴 HIGH | First multi-bank user to disconnect a bank loses everything |
| 2 | FUNC-4 — debt plaid_account_id not persisted | 🔴 HIGH | Debt duplication on every sync after first save cycle |
| 3 | FUNC-5 — remove_institution skips auth check | 🔴 HIGH | Any authed user can trigger data loss for themselves |
| 4 | FUNC-6 — mutable default args in save_user_data | 🟡 MEDIUM | Latent data corruption under future refactoring |
| 5 | SEC-7 — raw exceptions to client | 🟡 MEDIUM | Reconnaissance; not directly exploitable |
| 6 | SEC-8 — health endpoint info leak | 🟡 LOW | Minor info disclosure |
| 7 | SEC-4 — CORS wildcard | 🟡 LOW | Mitigated by hosting proxy; tighten to be explicit |
