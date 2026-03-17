# System Architecture — Personal Finance App (PFA)

**Date:** 2026-03-05

---

## Overview

PFA is a personal finance dashboard that aggregates bank accounts (via Plaid), tracks investments, budgets, and taxes, and provides an AI-powered advisor. It is built as a classic three-tier web app deployed entirely on Google/Firebase infrastructure.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React (Create React App), Tailwind CSS, Axios |
| Backend | Python, Flask (wrapped in Firebase Functions) |
| Database | Google Firestore (NoSQL document store) |
| Auth | Firebase Authentication (JWT, Google OAuth) |
| Hosting | Firebase Hosting (frontend), Firebase Functions us-west2 (backend) |
| External APIs | Plaid (bank data), yfinance (market prices), Gemini 1.5 Flash (AI advisor) |

---

## Request Flow

```
Browser (React)
    │
    │  HTTPS + Firebase JWT in Authorization header
    ▼
Firebase Hosting
    │
    │  Proxy /api/* →
    ▼
Firebase Function (us-west2)  ← Cold start: imports Flask app
    │
    │  flask app.full_dispatch_request()
    ▼
Flask Router (api.py)
    │
    ├── auth.py          token_required decorator — verifies Firebase JWT
    ├── firestore_db.py  get_user_data() / save_user_data()
    ├── price_service.py get_current_price() — yfinance HTTP call per asset
    ├── plaid_service.py sync_plaid_data() — Plaid API calls
    └── advisor_service.py get_financial_advice() — Gemini API call
```

---

## Data Model

All user data lives in a **single Firestore document** per user:

```
Firestore
└── users/
    └── {firebase_uid}          ← one document, everything inside
        ├── filing_status
        ├── state
        ├── incomes[]           ← embedded array
        ├── assets[]            ← embedded array
        ├── debts[]             ← embedded array
        ├── retirement_accounts[]
        ├── insurances[]
        ├── plaid_items[]       ← contains raw Plaid access_tokens (plaintext)
        ├── budgets[]
        ├── transactions[]      ← grows unboundedly with Plaid syncs
        └── paystubs[]
```

A second top-level collection is used for authorization:

```
└── whitelist/
    └── {firebase_uid}          ← existence = authorized user
```

---

## Component Responsibilities

### `main.py`
Firebase Functions entry point. Wraps the Flask app in an `https_fn.on_request` handler. All secrets (Plaid, Gemini) are injected via Firebase Secret Manager at deploy time.

### `auth.py`
Single decorator `token_required`. Verifies Firebase ID tokens via `firebase_admin.auth.verify_id_token()`. If no token is present, sets `request.uid = "guest"` and allows the request through (intended for demo mode).

### `api.py`
All route definitions. Also contains `is_user_authorized()`, which checks Firestore and a hardcoded email allowlist to gate premium features (Plaid sync, AI advisor). Every write endpoint follows the same pattern:
1. Load entire user document from Firestore
2. Merge incoming request data into in-memory objects
3. Overwrite the entire document back to Firestore

### `firestore_db.py`
Two functions: `get_user_data()` deserializes a Firestore document into Python model objects. `save_user_data()` serializes everything back and calls `user_ref.set(data)` — a full document overwrite every time.

### `price_service.py`
Calls `yfinance` synchronously for each asset ticker. No caching. No batching.

### `plaid_service.py`
Wraps the Plaid Python SDK. On sync, makes three API calls per linked institution: accounts, investment holdings, and transactions. Transaction lookback is hardcoded to `datetime(2026, 1, 1)`.

### `advisor_service.py`
Calls Gemini 1.5 Flash with the user's complete financial snapshot embedded in the system prompt alongside the raw user message.

### `models.py`
Python data classes defined using SQLAlchemy ORM syntax (`Base`, `Column`). SQLAlchemy is **never connected to a database** — the ORM layer is entirely unused. The classes function as plain Python objects.

---

## Scalability Flaws

### 1. Single Firestore Document Per User — 1MB Hard Limit

**The most critical structural flaw.**

Firestore enforces a 1MB maximum per document. All of a user's data — including every transaction ever synced from Plaid — is stored in one document. The transaction sync window starts at `2026-01-01` and never truncates old data.

```
Approximate growth:
  ~500 bytes/transaction × 300 transactions/year/account × 4 accounts
  = ~600KB/year → hits 1MB limit in under 2 years of normal use
```

When the document exceeds 1MB, `user_ref.set(data)` throws. The exception is caught by the broad `except Exception as e` handler and returned as a 500 error. **The user's data is silently not saved.** There is no alerting, no fallback, no partial write.

**Fix:** Move `transactions[]` and `paystubs[]` to Firestore subcollections. Load them with pagination. Store only summary counts in the root document.

---

### 2. N+1 Synchronous HTTP Calls Per Request

Every call to `GET /api/net_worth` or `PUT /api/portfolio` calls `asset_to_dict()` once per asset, which makes a live yfinance HTTP request:

```python
# api.py:29 — inside a loop over every asset
price_data = get_current_price(asset.ticker)
# → yf.Ticker(ticker).history(period='2d')  — synchronous HTTP
```

**There is no caching and no batching.** The same ticker appearing in multiple accounts is fetched multiple times.

```
10 assets  →  ~2–5 seconds added latency
30 assets  →  ~6–15 seconds added latency
50 assets  →  likely hits Firebase Functions 540s timeout
```

This also applies to the response from `plaid_sync`: after syncing and merging holdings, the endpoint immediately calls `asset_to_dict()` on every merged asset before returning.

**Fix:** Deduplicate tickers. Fetch in parallel with `ThreadPoolExecutor`. Cache results with a 5-minute TTL keyed by ticker symbol.

---

### 3. Full Document Read-Modify-Write on Every Mutation (Race Conditions)

Every write operation — portfolio update, Plaid sync, tax info update — follows this pattern:

```python
# Read
user, incomes, assets, ..., transactions = get_user_data(user_id=request.uid)

# Mutate in memory
assets = merge(assets, new_assets)

# Full overwrite
save_user_data(user, incomes, assets, ..., transactions, user_id=request.uid)
```

Two concurrent requests (e.g., a Plaid sync running while the user edits their portfolio) will both read the same state, diverge their mutations, and the **last write wins** — silently discarding the other's changes. Firestore transactions (`@firestore.transactional`) exist precisely for this scenario and are not used anywhere.

**Fix:** Wrap all read-modify-write operations in Firestore transactions. At minimum, the `plaid_sync` endpoint requires this.

---

### 4. No Rate Limiting

No endpoint has rate limiting. The consequences are financial and operational:

| Endpoint | Cost of unlimited calls |
|----------|------------------------|
| `POST /api/ask_advisor` | Gemini API billed per token. Each call loads full financial data (~5–20KB of JSON) into the prompt. |
| `POST /api/plaid_sync` | 3 Plaid API calls per institution per sync. Plaid enforces rate limits; repeated calls risk item suspension. |
| `GET /api/net_worth` | Triggers N yfinance HTTP calls. Hammering this endpoint can exhaust outbound connections from the Function instance. |

There is also no per-user quota — a single compromised or buggy client can exhaust shared API budgets.

**Fix:** Add Flask-Limiter with a Redis or Firestore backend. Suggested limits: advisor 20/hour, plaid_sync 10/hour, net_worth 60/hour per UID.

---

### 5. No Pagination on List Responses

Every API response includes the complete transaction list, regardless of whether the caller needs it:

```python
# api.py — in every endpoint response
net_worth_data['transactions'] = [transaction_to_dict(t) for t in transactions]
```

This runs in `GET /api/net_worth`, `PUT /api/portfolio`, `PUT /api/user_tax_info`, and `POST /api/plaid_sync`. As the transaction list grows, response payload sizes grow proportionally, increasing both latency and bandwidth cost on every request — including ones that have nothing to do with transactions.

The Budgeting component filters transactions entirely client-side after receiving all of them, which means the full list must be sent even when the user only wants the current month's data.

**Fix:** Return `transaction_count` in the main response. Add a dedicated `GET /api/transactions?start=&end=&page=&limit=` endpoint. Only the Budgeting view should fetch transactions.

---

### 6. Synchronous Blocking Architecture on a Serverless Runtime

Flask (without `async`) runs synchronously. Firebase Functions allocates one request per Function instance. Combined with the N+1 yfinance calls and sequential Plaid API calls, a single slow request blocks the entire instance:

```
plaid_sync request timeline (3 linked banks):
  Plaid accounts_get   ×3  →  ~300ms each  =  900ms
  Plaid investments_get ×3  →  ~400ms each  = 1200ms
  Plaid transactions_get ×3 →  ~500ms each  = 1500ms
  yfinance per holding  ×N  →  ~300ms each  = N×300ms
  Firestore read + write     →  ~200ms       =  200ms
  ─────────────────────────────────────────────────────
  Total (20 holdings):                      ~9.8 seconds
```

Firebase Functions has a **540-second hard timeout**, but Cloud Run (which backs it) will also terminate idle instances, causing cold starts that add 2–4 seconds on the first request after idle.

**Fix:** Use `concurrent.futures.ThreadPoolExecutor` for parallel Plaid calls and yfinance fetches. Consider moving Plaid sync to a background Cloud Task triggered async, returning immediately to the client and pushing results via Firestore real-time listeners.

---

### 7. SQLAlchemy as a Dead Dependency

`models.py` defines all data models using SQLAlchemy ORM syntax:

```python
from sqlalchemy import create_engine, Column, Integer, String, Float
Base = declarative_base()

class Asset(Base):
    __tablename__ = 'assets'
    id = Column(Integer, primary_key=True)
    ticker = Column(String, nullable=False)
    ...
```

No engine is ever created. No session is ever opened. The classes are instantiated directly as plain Python objects and the ORM layer is completely inert. SQLAlchemy adds ~15MB to the deployed bundle for zero benefit and signals a future intent to use a SQL database that was never followed through on.

**Fix:** Replace with Python `dataclasses`. This also makes the models serializable by default, reducing the manual dict-building in `firestore_db.py`.

---

## What Scales Fine

- **Firebase Auth** — handles JWTs and token verification at any scale without changes.
- **Firebase Hosting** — CDN-backed static hosting for the React app, scales automatically.
- **Firebase Functions** — the serverless deployment model itself scales horizontally; the bottleneck is the per-request logic, not instance count.
- **Firestore** — as a database technology scales extremely well; the problem is how it's being used (one giant document), not the technology itself.

---

## Summary

The app works correctly for a small number of users with moderate Plaid account connections. The architecture has three structural problems that will cause failures as usage grows, in order of urgency:

1. **Single Firestore document** will hit the 1MB hard limit and silently fail to save data.
2. **N+1 yfinance calls** will cause request timeouts for users with large portfolios.
3. **No atomic writes** will cause silent data loss under any concurrent usage pattern.

All three are fixable within the existing Firebase stack without switching databases or rearchitecting the frontend.
