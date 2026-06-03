# Security Audit — 2026-05-15

Focused review of cost-abuse and common "vibe-coded app" vulnerabilities, prompted by the question: *can a malicious user run up a massive API bill?*

**Answer at time of audit: yes, trivially.** Fixed in the same session. Details below.

---

## Findings & status

### 🔴 CRITICAL — Unauthenticated Claude cost abuse — FIXED

**Root cause:** `auth.py` treats any request without an `Authorization` header as `uid = "guest"` (intentional, for demo mode), and `check_rate_limit()` had `if uid == "guest": return True` — so guests skipped rate limiting entirely. Four expensive Claude endpoints used `@token_required` (allows guest) instead of `@auth_required` (rejects guest):

| Endpoint | Claude call | Fix |
|---|---|---|
| `/api/extract-document` | Vision + document (priciest) | `@auth_required` + `fail_closed=True` |
| `/api/upload_statement` | Vision + document | `@auth_required` + `fail_closed=True` |
| `/api/goals/ai_guidance` | Text | `@auth_required` + `fail_closed=True` |
| `/api/debts/card_summary` | Text | `@auth_required` + `fail_closed=True` |

Attack before fix: `curl -X POST .../api/extract-document -F file=@big.pdf` in a loop, no auth header, unlimited. Now returns 401 without a valid Firebase token.

### 🟠 HIGH — Rate-limiter race condition (TOCTOU) — FIXED

`check_rate_limit` did a plain `get()` then `set()` with no transaction. N concurrent requests all read the same count, all passed, all overwrote — so "20/hr" was bypassable by firing in parallel. Now wrapped in a Firestore `@firestore.transactional` read-modify-write that serializes the increment and retries on contention.

### 🟠 HIGH — `/api/health_brief` had no rate limit — FIXED

Was `@auth_required` (good) but had no `check_rate_limit` at all — any logged-in account could spam the Claude brief call. Added `health_brief` 40/hr `fail_closed=True`.

### 🟠 HIGH — Rate limiter failed OPEN — FIXED

`if not db: return True` allowed all requests when Firestore was unavailable — a fail-open cost control. Expensive endpoints now pass `fail_closed=True`, so a Firestore blip pauses spend instead of uncapping it. Cheap demo reads (net_worth) keep the lenient default so the demo never breaks.

### 🟡 MEDIUM — No upload size cap — FIXED

No `MAX_CONTENT_LENGTH` was set, so upload endpoints accepted arbitrarily large files (maximizing per-call Claude token cost + memory risk). Set `app.config['MAX_CONTENT_LENGTH'] = 10 MB`.

### 🟡 MEDIUM — Account-creation bypass — PARTIALLY MITIGATED

Even with per-`uid` limits, an attacker who scripts unlimited Firebase signups gets a fresh rate-limit bucket per account.

- **DONE (2026-05-15):** Per-IP rate limiting added on all six AI endpoints via `check_ip_rate_limit()` (keyed on a salted SHA-256 hash of `X-Forwarded-For`, never the raw IP). Limits set ~2.5× the per-user cap so shared office/household NAT isn't hit by normal use. This catches the common single-source multi-account attack.
- **DONE (2026-05-15):** email-verification gate on the priciest free AI endpoints (extract-document, upload_statement, goal_ai_guidance, card_summary). `request.email_verified` is checked server-side; unverified password signups get a 403 until they click the inbox link. Google sign-ins are auto-verified. Signup now sends the verification email. This is the friction that defeats rotating-IP multi-account abuse — a fresh account can't use expensive AI without a real, verifiable inbox.
- **Still open (lowest priority):** disable anonymous auth in Firebase if unused. The Anthropic spend cap remains the final backstop.

### 🟡 MEDIUM — Client-facing traceback leak — FIXED

`main.py`'s top-level exception handler returned `traceback.format_exc()` to the client on any unhandled crash, leaking internal file paths, library versions, and code structure. Now gated behind `DEBUG_TRACEBACKS=1` (off by default); the traceback is always logged server-side to Cloud Logging instead. Only fired on import/context-level crashes (route errors are caught in `api.py`), so blast radius was limited.

### 🐛 BUGFIX (not security) — advisor memory writes silently dropped — FIXED

`ask_advisor`'s background reflection thread accessed `request.uid` *inside* the spawned daemon thread, where Flask's request context doesn't exist — so every memory write raised "working outside of request context" and was silently dropped. Bound `uid` to a local before starting the thread.

### 🟢 Verified SOUND (no action needed)

- **`firestore.rules`** — correct per-user isolation (`request.auth.uid == userId`), owner-only whitelist write, global-deny default. No direct-DB IDOR. Subcollections fall through to global-deny, so the backend Admin SDK is the only path to them (correct).
- **CORS** — restricted to known origins. (Caveat: CORS is browser-enforced only; it does not stop `curl`/script attackers. It is not, and was never, the cost-control — the auth gating is. Also note `projectfymo.com` is not currently in the allowlist; add it if the frontend ever calls the API cross-origin instead of via the Hosting rewrite.)
- **Plaid tokens** — Fernet-encrypted at rest.
- **`ask_advisor`** — the correct template: `@auth_required` + premium gate + rate limit. The other endpoints were brought in line with it.

---

## ⚠️ REQUIRED manual step — set a provider spend cap

Code fixes reduce the attack surface, but the **single most important backstop** is a hard spend ceiling at the provider, which converts "surprise $10k bill" into "feature pauses until next month":

1. **Anthropic Console** → <https://console.anthropic.com> → Billing / Usage Limits → set a **monthly spend cap** (e.g. $50–100 to start). This is the one control that is impossible to bypass from the app.
2. **Plaid Dashboard** → set up billing alerts; Plaid bills per-item/per-product, so watch for an unusual spike in Link or sync calls.
3. **Google Cloud Billing** → set a **budget + alert** on the Firebase project (<https://console.cloud.google.com/billing>) so Cloud Functions invocations / egress can't silently balloon.

Do #1 today, regardless of anything else.

---

## What changed in code (this commit)

- `backend/api.py`:
  - `check_rate_limit()` rewritten: transactional, `fail_closed` param.
  - `MAX_CONTENT_LENGTH = 10 MB`.
  - `extract-document`, `upload_statement`, `goal_ai_guidance`, `card_summary`: `@token_required` → `@auth_required`, `fail_closed=True`.
  - `health_brief`: added 40/hr `fail_closed=True` limit.

## Recommended follow-ups (not blocking)

- Email-verification gate before AI features unlock (defeats rotating-IP multi-account abuse that per-IP limiting can't catch).
- Frontend: hide AI-feature buttons for guests so they get a "sign in" prompt instead of a 401 toast (UX polish; security is already enforced server-side).
- Migrate the main user-doc save path (`save_user_data`) to transactions too — still read-modify-write (acknowledged tech debt).
- `ADMIN_MIGRATION_KEY` is not a declared Cloud Functions secret, so `/api/admin/grant_premium` and `/api/admin/migrate_whitelist_to_subscribed` currently always return 403 (fail-closed — safe, but unusable). Declare it in `main.py` `_SECRETS` + set the secret if you want to use them.
- `_sanitize_for_ai()` only strips non-printable chars; it does not redact PII. That's acceptable (per-user data isolation prevents cross-user leakage, and sending a user's own data to Claude is the product's function), but the CLAUDE.md description overstates it.
