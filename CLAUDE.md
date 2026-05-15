# Fymo — Agent Context

This file is read automatically by Claude Code. It provides project context, conventions, and guardrails for AI-assisted development.

## Project Overview

Fymo is a full-stack personal finance web app. React 19 frontend, Python/Flask backend running on Firebase Cloud Functions, Firestore database, Plaid for bank sync, **Claude Sonnet 4.6 for all AI features** — chat (AI Analyst), morning/health briefs, per-goal guidance, and PDF/image statement extraction (paystubs, insurance, bank statements) via Claude's native document + vision blocks. No other LLMs are used.

- **Brand:** Fymo (`projectfymo.com`)
- **Live URL:** https://personal-finance-app-18cbc.web.app (point `projectfymo.com` → Firebase Hosting)
- **Firebase project:** `personal-finance-app-18cbc`
- **Current version:** v1.6.0 (Production)
- **Current phase:** Market Launch & User Engagement
- **Codebase size:** 43 frontend JS files (~10,900 LOC) · 13 backend Python files (~5,400 LOC) · ~16,300 LOC total
- **Changelog:** see `CHANGELOG.md` at repo root for release notes.

## Feature Inventory

| Feature | Status | Notes |
|---------|--------|-------|
| Dashboard (net worth, tax, cash flow, emergency fund, portfolio return) | ✅ Live | Portfolio return uses investment transaction history when available |
| AI Analyst (Claude Sonnet chat) | ✅ Live | Rate-limited 20/hr; SSE streaming; agentic tool-use loop; sanitized context |
| AI Morning/Health Briefs | ✅ Live | Claude Sonnet overview + live market pulse (SPY/QQQ/BTC/GLD/TLT via yfinance) |
| Goals tab | ✅ Live | CRUD goals + per-goal Claude AI guidance (15/hr rate limit); stored in `goals` subcollection |
| Expenditures / Budgeting | ✅ Live | Flexible spending has Month/3Mo/YTD/12Mo period selector |
| Income | ✅ Live | Manual + Plaid-detected paystubs; `is_net_primary` flag excludes net paychecks from tax estimate |
| Tax Projection | ✅ Live | 50-state engine; shows N/A when all income is net (no gross data) |
| Investments | ✅ Live | Inline cost-basis editing per holding; table totals row aligned |
| Plaid sync | ✅ Live | Fetches YTD bank transactions (Jan 1 + pagination); 5yr investment transaction history for total return |
| Debts | ✅ Live | Institution-name-aware labeling (Chase Credit Card, Pending Settlement, Margin Loan) |
| Insurance | ✅ Live | Manual entry + PDF extraction |
| Check Tracker | ✅ Live | Outstanding check management |
| Visualizations | ✅ Live | Charts and allocation views |
| Security FAQ | ✅ Live | 11-question accordion; covers Plaid, AI, Stripe, deletion, CCPA/GDPR |
| Privacy Policy | ✅ Live | `/privacy` route; linked in sidebar footer |
| Terms of Service | ✅ Live | `/terms` route; linked in sidebar footer |
| Stripe billing | ✅ Live | $9.99/mo Premium; `is_subscribed` field in Firestore |
| Whitelist access | ✅ Live | `is_authorized` via `whitelist` collection; frontend: `isPremium = is_subscribed \|\| is_authorized` |

## Key Files

| File | Role |
|------|------|
| `frontend/src/App.js` | Top-level state manager. Controls `activeView`, fetches `/api/net_worth`, handles auth. ~1200 lines. |
| `backend/api.py` | All Flask routes (~45 endpoints). ~1900 lines. |
| `backend/firestore_db.py` | All Firestore reads/writes + Fernet encryption for Plaid tokens. Defines `UserData` dataclass — `get_user_data()` returns this; supports both legacy tuple unpacking and named attribute access. |
| `backend/models.py` | Enums and dataclasses (AssetType, FilingStatus, IncomeType, etc.). |
| `backend/calculations.py` | `calculate_net_worth()` — tax engine bridge, income aggregation. Net-primary paystubs excluded from gross. |
| `backend/tax_logic.py` | 50-state tax engine. Federal + state + FICA for 2025/2026. |
| `backend/plaid_service.py` | Full Plaid integration: accounts, transactions (YTD + paginated), investment holdings, investment transactions (5yr), liabilities. |
| `backend/advisor_service.py` | Claude Sonnet 4.6 AI advisor. Streaming advice, agentic tool-use, health/morning briefs, memory extraction. |
| `backend/category_mapping.json` | Single source of truth for transaction categories + keyword patterns. Served via `/api/config/categories`. |
| `backend/diagnostics_service.py` | Secret sanitization diagnostics endpoint. Used by `/api/admin/diagnostics`. |
| `backend/price_service.py` | Yahoo Finance price fetching with 2s localized timeouts. |
| `backend/auth.py` | `@token_required` decorator — decodes Firebase JWT. |
| `frontend/src/index.css` | CSS variables (--primary-blue, --card-shadow, etc.). Use these, not ad-hoc Tailwind. |
| `frontend/src/components/Dashboard.js` | Financial health cards (YTD, cash flow, emergency fund, portfolio return). Accepts `investmentHistory` prop. |
| `frontend/src/components/AssetTable.js` | Investment holdings table with inline cost-basis editing. Accepts `onUpdateCostBasis` callback. |
| `frontend/src/components/Goals.js` | Goals CRUD + per-goal Claude AI guidance. Standalone component, uses `/api/goals/*`. |
| `frontend/src/components/Budgeting.js` | Budgeting + flexible spending. Has `flexPeriod` state (month/3m/ytd/12m). |
| `frontend/src/components/DataPrivacyFAQ.js` | 11-question collapsible Security FAQ. |
| `frontend/src/components/PrivacyPolicy.js` | Full privacy policy page. Route: `activeView === 'privacy'`. |
| `frontend/src/components/TermsOfService.js` | Full TOS page. Route: `activeView === 'terms'`. |
| `frontend/src/components/Layout.js` | Sidebar nav + footer links (Privacy Policy · Terms of Service). |

## Subcollections in Firestore

User data is split between the main `/users/{uid}` document and subcollections to avoid the 1MB limit:

| Subcollection | Contents |
|---------------|----------|
| `transactions` | Bank/card transactions (up to 500, ordered by date desc) |
| `paystubs` | Auto-detected + manual paystubs |
| `custom_rules` | Per-user transaction categorization rules |
| `outstanding_checks` | Written checks pending clearance |
| `goals` | Financial goals (CRUD via `/api/goals/*`) |
| `portfolio_snapshots` | Daily investment value snapshots for future MWR calculations (written on each Plaid sync) |

## Critical Rules

### 1. Shadow Data Verification
Any change to `models.py` or `firestore_db.py` requires checking `App.js` `handleSave()` and `fetchData()` to ensure frontend/backend mapping still works. These break silently.

### 1a. UserData Field Order
`UserData._LEGACY_ORDER` in `firestore_db.py` is the source of truth for tuple-unpacking compatibility. **Never reorder fields** — every call site that does `user, incomes, assets, ... = get_user_data(uid)` depends on the position. Add new fields at the end of both `_LEGACY_ORDER` and the dataclass fields, in the same order. New code should prefer attribute access (`ud.assets`).

### 2. CSS Convention
Use CSS variables from `index.css` first. Only use Tailwind classes if no variable exists. Never inline styles.

### 3. Fresh User State
Every feature must handle the empty/new-user case. If a feature requires data to render, it must show a "See how it works" CTA with sample data when the user has nothing.

### 4. Auth Decorator
`@token_required` in `auth.py` sets `uid = "guest"` for missing tokens (intentional demo mode). If a route must reject unauthenticated requests, check `uid == "guest"` and return 401 explicitly.

### 5. Firestore Write Pattern
All writes are read-modify-write. There are currently no Firestore transactions. Be aware of race conditions on concurrent writes. Do not introduce new unbounded list appends to the top-level user document — new collections of data belong in subcollections.

### 6. Price Fetching
`price_service.py` fetches prices sequentially per ticker. For new features that need prices, use the existing `get_price()` function — do not add new yfinance calls inline.

### 7. Cost Basis Storage
`asset.cost_basis` is stored as **cost per share** (not total position cost). Always multiply by `asset.shares` to get total position cost. The Investments table displays it as "Cost/Sh" correctly.

### 8. Paystub Net-Primary Flag
Plaid auto-detected paystubs have `is_net_primary=True`. Their `gross_amount` is actually the net deposit. `calculations.py` excludes these from gross income to avoid taxing already-taxed money. The tax card shows N/A when all payroll data is net-primary and no manual gross income exists.

### 9. Rate Limiting
All expensive endpoints use the Firestore-based `check_rate_limit(uid, action, limit_per_hour)` pattern. Current limits:
- AI Analyst: 20/hr
- Goal AI Guidance: 15/hr
- Plaid Sync: 15/hr
- Morning/Health Brief: per-endpoint limits in `advisor_service.py`

## Known Technical Debt (Do Not Introduce More)

- **1MB Firestore document limit** — user data is split across subcollections but the top-level doc still holds assets, debts, incomes, etc. Do not add more unbounded arrays to the top-level document.
- **No atomic writes** — concurrent writes lose data. Don't make this worse.
- **SQLAlchemy is imported in `models.py` but never connected** — ignore it, don't add to it.
- **Admin emails previously hardcoded in frontend JS** — removed; whitelist is now purely Firestore-based.
- **Portfolio returns use institution cost basis** — Plaid Holdings `cost_basis` field is ground truth. A 10% coverage guard prevents absurd % when basis data is sparse. Daily snapshots are being taken in `portfolio_snapshots` subcollection for future MWR calculations.

## Security Standards

- Never hardcode API keys, secrets, or credentials in any file.
- Never commit `.env` files or service account JSON files.
- Always verify Firebase auth context in backend routes.
- Sanitize all user input before passing to Claude (see `_sanitize_for_ai()` in `advisor_service.py`).
- Plaid tokens must be encrypted via Fernet before writing to Firestore.
- Rate-limit expensive endpoints (Gemini calls, Plaid sync) using the existing Firestore-based limiter pattern.

## Deployment

CI/CD via GitHub Actions (`.github/workflows/deploy.yml`). Pushes to `main` auto-deploy to Firebase Hosting + Cloud Functions. Manual trigger: GitHub Actions → "Deploy to Firebase" → "Run workflow".

Do not run `npm run deploy` locally unless GitHub Actions is unavailable.

## Repo Structure

```
/
├── backend/               Flask app (Cloud Functions)
│   ├── api.py             All routes
│   ├── calculations.py    Net worth + tax calculation
│   ├── models.py          Data models / enums
│   ├── plaid_service.py   Plaid sync (holdings, transactions, inv. history)
│   ├── advisor_service.py Gemini AI features
│   ├── tax_logic.py       50-state tax engine
│   ├── firestore_db.py    Firestore R/W + Fernet encryption
│   ├── price_service.py   Yahoo Finance price fetcher
│   ├── diagnostics_service.py  Secret metadata diagnostics
│   ├── auth.py            @token_required decorator
│   ├── statement_processor.py  PDF/image statement extraction
│   └── main.py            Cloud Function entry point + secret declarations
├── frontend/src/
│   ├── App.js             Root state + routing
│   ├── components/        All UI components (29 files)
│   └── context/           AuthContext, ThemeContext, ToastContext
├── code-review/           Architecture + security docs (not deployed)
├── bare-metal-public/     Google Search Console verification
├── static-verify-public/  Google Search Console verification
├── firebase.json          Hosting + Functions config
├── firestore.rules        Firestore security rules
└── .github/workflows/     CI/CD deploy pipeline
```

## What NOT to Do

- Do not add new npm packages without checking if an existing dependency covers the need.
- Do not create new top-level files without a clear purpose.
- Do not modify `firebase.json` without understanding the hosting/functions/rewrite chain.
- Do not add `console.log` debugging to production frontend code.
- Do not increase the Firebase Function timeout beyond 300s — it is already at the limit.
- Do not add unbounded arrays to the top-level Firestore user document.
- Do not add new yfinance calls inline — use `price_service.get_price()`.
