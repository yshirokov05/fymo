# Financial Headquarters (FHQ) — Agent Context

This file is read automatically by Claude Code. It provides project context, conventions, and guardrails for AI-assisted development.

## Project Overview

FHQ is a full-stack personal finance web app. React 19 frontend, Python/Flask backend running on Firebase Cloud Functions, Firestore database, Plaid for bank sync, Google Gemini for AI features.

- **Live URL:** https://personal-finance-app-18cbc.web.app
- **Firebase project:** `personal-finance-app-18cbc`
- **Current version:** v1.3.0 (Production)
- **Current phase:** Market Launch & User Engagement (Phase 6 Stripe complete)

## Key Files

| File | Role |
|------|------|
| `frontend/src/App.js` | Top-level state manager. Controls `activeView`, fetches `/api/net_worth`, handles auth. ~1100 lines. |
| `backend/api.py` | All Flask routes (~40 endpoints). ~2400 lines. |
| `backend/firestore_db.py` | All Firestore reads/writes + Fernet encryption for Plaid tokens. |
| `backend/models.py` | Enums and dataclasses (AssetType, FilingStatus, IncomeType, etc.). |
| `backend/tax_logic.py` | 50-state tax engine. Federal + state + FICA for 2025/2026. |
| `backend/plaid_service.py` | Full Plaid integration: accounts, transactions, investments, liabilities. |
| `backend/advisor_service.py` | Gemini AI advisor. Loads user context, generates financial advice. |
| `backend/price_service.py` | Yahoo Finance price fetching with 2s localized timeouts. |
| `backend/auth.py` | `@token_required` decorator — decodes Firebase JWT. |
| `frontend/src/index.css` | CSS variables (--primary-blue, --card-shadow, etc.). Use these, not ad-hoc Tailwind. |

## Critical Rules

### 1. Shadow Data Verification
Any change to `models.py` or `firestore_db.py` requires checking `App.js` `handleSave()` and `fetchData()` to ensure frontend/backend mapping still works. These break silently.

### 2. CSS Convention
Use CSS variables from `index.css` first. Only use Tailwind classes if no variable exists. Never inline styles.

### 3. Fresh User State
Every feature must handle the empty/new-user case. If a feature requires data to render, it must show a "See how it works" CTA with sample data when the user has nothing.

### 4. Auth Decorator
`@token_required` in `auth.py` sets `uid = "guest"` for missing tokens (intentional demo mode). If a route must reject unauthenticated requests, check `uid == "guest"` and return 401 explicitly.

### 5. Firestore Write Pattern
All writes are read-modify-write. There are currently no Firestore transactions. Be aware of race conditions on concurrent writes. Do not introduce new unbounded list appends to the top-level user document — transactions belong in subcollections.

### 6. Price Fetching
`price_service.py` fetches prices sequentially per ticker. For new features that need prices, use the existing `get_price()` function — do not add new yfinance calls inline.

## Known Technical Debt (Do Not Introduce More)

- **1MB Firestore document limit** — all user data in one doc. Transactions will eventually overflow. Don't add more unbounded data to the top-level user document.
- **No atomic writes** — concurrent writes lose data. Don't make this worse.
- **SQLAlchemy is imported in models.py but never connected** — ignore it, don't add to it.
- **Admin emails hardcoded in frontend JS** — known issue, tracked for removal.

## Security Standards

- Never hardcode API keys, secrets, or credentials in any file.
- Never commit `.env` files or service account JSON files.
- Always verify Firebase auth context in backend routes.
- Sanitize all user input before passing to Gemini (see `_sanitize_for_ai()` in `advisor_service.py`).
- Plaid tokens must be encrypted via Fernet before writing to Firestore.
- Rate-limit expensive endpoints (Gemini calls, Plaid sync) using the existing Firestore-based limiter pattern.

## Deployment

CI/CD via GitHub Actions (`.github/workflows/deploy.yml`). Pushes to `main` auto-deploy. Manual trigger available via GitHub Actions → "Deploy to Firebase" → "Run workflow".

Do not run `npm run deploy` locally unless GitHub Actions is unavailable.

## What NOT to Do

- Do not add new npm packages without checking if an existing dependency covers the need.
- Do not create new top-level files without a clear purpose — the root is already crowded.
- Do not modify `firebase.json` without understanding the hosting/functions/rewrite chain.
- Do not add `console.log` debugging to production frontend code.
- Do not increase the Firebase Function timeout beyond 300s — it is already at the limit.
