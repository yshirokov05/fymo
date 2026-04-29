# System Architecture — Fymo

**Last updated:** 2026-04-28
**Version:** v1.5.0

---

## Overview

Fymo is a full-stack personal finance dashboard. React 19 frontend, Python/Flask backend running on Firebase Cloud Functions, Firestore database, Plaid for bank sync, Claude Sonnet 4.6 for all AI features, Gemini 1.5 Flash for document/PDF extraction only.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 (Create React App), Tailwind CSS, Axios |
| Backend | Python 3, Flask (wrapped in Firebase Functions us-west2) |
| Database | Google Firestore (NoSQL document store) |
| Auth | Firebase Authentication (JWT, Google OAuth, email/password) |
| Hosting | Firebase Hosting (frontend CDN) + Firebase Functions (backend) |
| Bank Sync | Plaid (production) — read-only scopes only |
| AI Advisor | Claude Sonnet 4.6 via Anthropic API (streaming SSE, tool-use loop) |
| Doc Extraction | Gemini 1.5 Flash via Google AI API (PDF/image parsing only) |
| Market Data | yfinance — per-ticker price fetches |
| Payments | Stripe (live mode) — $9.99/mo Premium subscriptions |
| Analytics | Google Analytics GA4 (G-DPMJ663964) |

---

## Request Flow

```
Browser (React 19)
    │
    │  HTTPS + Firebase JWT in Authorization header
    ▼
Firebase Hosting  (projectfymo.com → Firebase CDN)
    │
    │  Rewrite /api/* →
    ▼
Firebase Function (us-west2)  ← Cold start: imports Flask app
    │
    │  flask app.full_dispatch_request()
    ▼
Flask Router (api.py)  ~45 routes, ~1900 LOC
    │
    ├── auth.py              @token_required — verifies Firebase JWT; uid="guest" in demo mode
    ├── firestore_db.py      get_user_data() / save_user_data() + Fernet encryption for Plaid tokens
    ├── price_service.py     get_price() — yfinance HTTP call per asset (2s timeout)
    ├── plaid_service.py     sync_plaid_data() — YTD transactions + 5yr investment history
    ├── advisor_service.py   Claude Sonnet 4.6 — streaming chat, health briefs, morning briefs
    ├── tax_logic.py         50-state tax engine (Federal + state + FICA)
    └── calculations.py      calculate_net_worth() — aggregates all user data
```

---

## Data Model

User data is split across the root document and subcollections to stay under the 1MB limit:

```
Firestore
└── users/
    └── {firebase_uid}
        ├── filing_status, state
        ├── incomes[]              ← still in root doc (bounded, typically <20)
        ├── assets[]               ← still in root doc (typically <50)
        ├── debts[]                ← still in root doc (typically <20)
        ├── insurances[]           ← still in root doc
        ├── plaid_items[]          ← Fernet-encrypted access tokens
        ├── is_subscribed          ← Stripe subscription flag
        ├── stripe_customer_id
        │
        ├── transactions/          ← SUBCOLLECTION (up to 500, ordered by date desc)
        ├── paystubs/              ← SUBCOLLECTION
        ├── custom_rules/          ← SUBCOLLECTION (per-user category rules)
        ├── outstanding_checks/    ← SUBCOLLECTION
        ├── goals/                 ← SUBCOLLECTION (CRUD via /api/goals/*)
        └── portfolio_snapshots/   ← SUBCOLLECTION (daily investment value for MWR)

└── whitelist/
    └── {firebase_uid}             ← is_authorized flag (whitelisted testers)
```

---

## Component Responsibilities

### `main.py`
Firebase Functions entry point. Wraps Flask in `https_fn.on_request`. All secrets (Plaid, Anthropic, Gemini, Fernet key, Stripe) are injected via Firebase Secret Manager at deploy time. Function timeout: 300s.

### `auth.py`
`@token_required` decorator. Verifies Firebase ID tokens. Missing token → `uid = "guest"` (demo mode, intentional). Routes that must block guests check `uid == "guest"` explicitly and return 401.

### `api.py`
~45 routes. Authorization gating via `is_user_authorized()` for Plaid/AI endpoints — checks `is_subscribed` or `is_authorized` flag in Firestore by UID only (no hardcoded emails). Rate limiting via Firestore-based `check_rate_limit(uid, action, limit_per_hour)`.

### `firestore_db.py`
`get_user_data()` deserializes root doc + subcollection queries. `save_user_data()` does full root-doc overwrite via `user_ref.set(data)`. Plaid access tokens are **Fernet-encrypted (AES-128-CBC)** before write, decrypted on read.

### `calculations.py`
`calculate_net_worth()` — aggregates assets, debts, incomes into the net worth response. Bridges the tax engine. Excludes net-primary paystubs from gross income.

### `tax_logic.py`
50-state tax engine. 2025/2026 brackets. Federal + state + FICA. Returns N/A when all payroll is net-primary and no gross income exists.

### `plaid_service.py`
Full Plaid integration: accounts, YTD transactions (Jan 1 + pagination), investment holdings, investment transactions (5-year history for total return), liabilities.

### `advisor_service.py`
Claude Sonnet 4.6 AI advisor. SSE streaming, agentic tool-use loop, health/morning briefs, memory extraction. Sanitizes all user data before passing to model via `_sanitize_for_ai()`.

### `price_service.py`
`get_price(ticker)` — yfinance sequential fetch with 2s localized timeout. Used by asset pricing everywhere. Do not add inline yfinance calls.

### `models.py`
Python data classes using SQLAlchemy ORM syntax — **SQLAlchemy is never connected to a database**. Classes function as plain Python objects. Dead dependency (see technical debt).

---

## Rate Limits (Firestore-based)

| Endpoint / Action | Limit |
|-------------------|-------|
| AI Analyst chat | 20/hr per user |
| Goal AI guidance | 15/hr per user |
| Plaid sync | 15/hr per user |
| Morning/Health briefs | Per-endpoint limits in advisor_service.py |

---

## Codebase Size

| Layer | Files | LOC |
|-------|-------|-----|
| Frontend (`src/`) | 42 JS files | ~10,600 |
| Backend | 13 Python files | ~5,400 |
| **Total** | **55 files** | **~16,000** |

---

## Known Technical Debt (in priority order)

### 1. ARCH-1 — Root Document Still Holds Unbounded Arrays (Partial Fix)
Transactions and paystubs moved to subcollections. But `assets[]`, `debts[]`, `incomes[]`, `insurances[]` remain in the root document. A user with hundreds of manually added assets can still approach the 1MB limit. **Phase 7 fix:** move these to subcollections too.

### 2. ARCH-2 — N+1 Synchronous yfinance Calls Per Request
`GET /api/net_worth` calls `get_price()` once per asset, sequentially. 30 assets = ~6–15s of blocking I/O. No deduplication of repeated tickers. Mitigated by the 2s per-ticker timeout, but not fixed. **Fix:** deduplicate + parallel fetch with ThreadPoolExecutor.

### 3. ARCH-3 — No Atomic Writes (Race Conditions)
All writes are read-modify-write with no Firestore transactions. Concurrent Plaid sync + portfolio edit = last write wins. **Fix:** wrap plaid_sync in a Firestore transaction.

### 4. ARCH-4 — SQLAlchemy as a Dead Dependency
`models.py` uses SQLAlchemy ORM syntax but never connects an engine. Adds ~15MB to the deploy bundle for zero benefit. **Fix:** convert to Python dataclasses.

### 5. ARCH-5 — No Pagination on Transactions API
Transactions subcollection capped at 500 on write, but the full list is still returned in every `/api/net_worth` response. **Fix:** dedicated `/api/transactions` endpoint with date-range + pagination params.

---

## What Scales Fine

- **Firebase Auth** — stateless JWT verification, scales automatically.
- **Firebase Hosting** — CDN-backed React bundle, zero config scaling.
- **Firebase Functions** — horizontal scale via Cloud Run backing; bottleneck is per-request logic, not concurrency.
- **Firestore** — scales well as a database; the bottleneck is usage pattern (large root doc), not the technology.
- **Stripe** — fully managed, no scaling concerns.
