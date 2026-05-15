# Fymo
### Personal Finance Command Center

**Live:** [projectfymo.com](https://projectfymo.com) · [personal-finance-app-18cbc.web.app](https://personal-finance-app-18cbc.web.app)

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Flask](https://img.shields.io/badge/Flask-Python%203.12-000000?style=flat-square&logo=flask)](https://flask.palletsprojects.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%2B%20Auth%20%2B%20Functions-FFCA28?style=flat-square&logo=firebase)](https://firebase.google.com/)
[![Plaid](https://img.shields.io/badge/Plaid-12%2C000%2B%20Institutions-00D64F?style=flat-square)](https://plaid.com/)
[![Claude](https://img.shields.io/badge/Claude-Sonnet%204.6-D97757?style=flat-square&logo=anthropic)](https://www.anthropic.com/api)
[![Stripe](https://img.shields.io/badge/Stripe-Billing-635BFF?style=flat-square&logo=stripe)](https://stripe.com/)

![deploy](https://github.com/yshirokov05/fymo/actions/workflows/deploy.yml/badge.svg)

Fymo is an all-in-one personal finance platform. Link your bank, track real-time net worth, get AI-powered insights, project taxes across all 50 states, harvest tax losses, monitor a 0-100 financial health score, and stay on top of debt, subscriptions, and investments — all in one place.

**Current version:** v1.7.0 (Production)

---

## Features

### Dashboard
- **Net Worth** — Real-time across cash, investments, real estate, and debts
- **Financial Health Score** — 0-100 across savings rate, emergency fund, debt/assets, diversification; daily snapshots powering a 90-day trend
- **Allocation Donut** — Sector breakdown of holdings
- **Cash Flow + YTD Spending** — Monthly + YTD with top categories
- **Emergency Fund** — Liquid-assets / trailing-3-month spending
- **Portfolio Return** — Time-weighted via Plaid investment transactions when available; cost-basis fallback with sparse-data guard
- **Est. Annual Tax** — Federal + State + FICA with a "show math" panel that splits income subject to tax from estimated tax owed and shows each tax line's base

### Bank Integration
- **Plaid Sync** — 12,000+ US institutions; parallel fetch of accounts, transactions (YTD), investment holdings, investment transactions (5yr), and liabilities
- **Auto-Categorization** — JSON keyword mapping + per-user custom rules
- **Smart Dedup** — Pending → cleared transaction matching prevents double-counting
- **Universal Statement Upload** — Any bank statement (PDF, CSV, image) → AI-extracted transactions, no Plaid required

### AI (all Claude Sonnet 4.6)
- **AI Analyst** — Streaming chat with agentic tool-use loop and sanitized financial context (20/hr rate limit)
- **Morning + Health Briefs** — AI overview + live market pulse (SPY/QQQ/BTC/GLD/TLT); scheduled email/push delivery via Resend
- **Per-Goal Guidance** — Feasibility assessment + monthly target for each goal
- **No-BS Credit Card Summary** — Click any synced card → 5-section AI analysis (annual fee, top perks with $ value, best uses, weak points, verdict); Firestore-cached 30 days
- **AI Document Extraction** — Paystubs, insurance policies, bank statements via Claude vision + document blocks (no separate OCR pass)

### Tax Engine
- **50-State Calculator** — Federal, all-state, and FICA estimates with 2025/2026 brackets
- **All Filing Statuses** — Single, MFJ, MFS, Head of Household, Qualifying Widow
- **Capital Gains** — ST taxed as ordinary income; LT stacked at 0/15/20% preferential rates with FIFO lot matching
- **Net Paystub Handling** — Plaid-detected net paychecks excluded from gross calc so you're not taxed twice; per-paystub `subject_to_fica` flag for scholarships/fellowships/1099s
- **Tax Loss Harvesting** — Surfaces underwater positions with realized-loss preview

### Financial Planning
- **Goals** — CRUD with per-goal AI guidance (15/hr)
- **Debt Cards** — Card-based debt view with progress bars for loans, APR / min payment / payoff projection
- **Subscriptions Tracker** — Auto-detected recurring charges + manual entries
- **Portfolio Calendar** — Earnings + dividend + ex-div dates for held positions
- **Milestone Celebrations** — Modal when you cross a new net-worth milestone
- **Visualizations** — Charts and allocation views

### Security + Account
- **Plaid tokens** encrypted at rest (Fernet AES-128-CBC)
- **2FA** — Optional TOTP via authenticator app
- **Firebase Auth** — Email/password + Google OAuth
- **Stripe Billing** — $9.99/mo Premium; whitelist override via Firestore

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  React 19 Frontend (Fymo)                    │
│        Tailwind CSS · Recharts · Lucide · Capacitor          │
└────────────────────────┬─────────────────────────────────────┘
                         │ REST + Firebase JWT
┌────────────────────────▼─────────────────────────────────────┐
│            Flask Backend  ·  Python 3.12                     │
│       Firebase Cloud Functions Gen 2  ·  us-west2            │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
│  │ tax_logic│ │  plaid   │ │ advisor  │ │ health_score │    │
│  │ 50-state │ │ parallel │ │  Claude  │ │  4-component │    │
│  │  engine  │ │   sync   │ │  Sonnet  │ │   0-100 idx  │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
│  │subscript.│ │tax_loss  │ │ calendar │ │     2fa      │    │
│  │ detector │ │harvest   │ │  yfin    │ │    TOTP      │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘    │
└──────┬──────────────┬──────────────┬─────────────────┬──────┘
       │              │              │                 │
┌──────▼─────┐  ┌─────▼─────┐  ┌─────▼──────┐  ┌──────▼─────┐
│  Firestore │  │  Plaid    │  │ Anthropic  │  │   Stripe   │
│ subcolls + │  │ Production│  │   Claude   │  │  Billing   │
│ Fernet enc │  │           │  │  Sonnet    │  │            │
└────────────┘  └───────────┘  └────────────┘  └────────────┘
```

**Security model:** Per-user Firestore document keyed by Firebase UID. Strict Firestore rules deny cross-user access. Plaid access tokens encrypted at rest with Fernet. Premium gating runs on Firestore (`is_subscribed || is_authorized`) — never frontend-only.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Tailwind CSS, Recharts, Lucide Icons, Axios |
| Backend | Python 3.12, Flask, Firebase Cloud Functions Gen 2 (us-west2) |
| Database | Google Firestore (NoSQL document store + subcollections) |
| Auth | Firebase Authentication (email/password + Google OAuth + optional TOTP 2FA) |
| AI | Claude API (Anthropic Sonnet 4.6) — chat, briefs, goal guidance, card summary, document extraction |
| Bank Sync | Plaid Production |
| Pricing | Yahoo Finance (yfinance) |
| Payments | Stripe |
| Email | Resend (scheduled morning briefs) |
| Mobile | iOS + Android via Capacitor |
| CI/CD | GitHub Actions → Firebase Hosting + Functions |

---

## Codebase Stats

| Layer | Files | LOC |
|-------|------:|-----:|
| Frontend JS | 51 | ~13,100 |
| Backend Python | 20 | ~7,900 |
| **Total** | **71** | **~21,000** |

*v1.7.0 · May 2026*

---

## Getting Started

### Prerequisites
- Node.js v18+
- Python 3.12
- Firebase CLI: `npm install -g firebase-tools`

### Setup

```bash
git clone https://github.com/yshirokov05/fymo.git
cd fymo

# Frontend
cd frontend
npm install --legacy-peer-deps
npm start             # Dev server at http://localhost:3000

# Backend (separate terminal)
cd backend
python -m venv venv
source venv/bin/activate     # macOS/Linux
.\venv\Scripts\activate      # Windows
pip install -r requirements.txt
```

### Firebase Secrets

Set in Firebase Console → Project Settings → Secret Manager:

| Secret | Purpose |
|--------|---------|
| `PLAID_CLIENT_ID` | Plaid dashboard client ID |
| `PLAID_SECRET` | Plaid production secret |
| `PLAID_ENV` | `production` or `sandbox` |
| `PLAID_REDIRECT_URI` | OAuth redirect URI for Plaid Link |
| `ANTHROPIC_API_KEY` | Claude API key — all AI features |
| `FERNET_KEY` | Symmetric encryption key for Plaid tokens at rest |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_ID` | Premium subscription price ID |
| `RESEND_API_KEY` | Resend API key (optional — brief delivery no-ops without it) |
| `BRIEF_FROM_EMAIL` | Verified sender address for morning briefs |

GitHub Actions secret: `FIREBASE_SERVICE_ACCOUNT` (deploy auth).

### Deploy

Push to `main` — GitHub Actions runs `.github/workflows/deploy.yml` and ships frontend + functions to Firebase. Manual trigger: GitHub → Actions → "Deploy to Firebase" → Run workflow.

---

## Roadmap

- [x] Phase 1 — Core Tax & Net Worth Engine
- [x] Phase 2 — Production Plaid Integration
- [x] Phase 3 — AI Advisor & Budget Tracking
- [x] Phase 4 — Performance & AI Stability (parallel sync, deduplication)
- [x] Phase 5 — Universal AI Statement Ingestion & Insurance Audit
- [x] Phase 6 — Stripe Billing & Market Launch (v1.6.x)
- [x] Phase 7 — Financial Health Score, 2FA, Scheduled Briefs, Tax Loss Harvesting, Portfolio Calendar (v1.7.0)
- [ ] Phase 8 — Money-weighted return, multi-account goals, expanded statement formats

See `CHANGELOG.md` for per-release notes.

---

## License

All rights reserved. © Yury Shirokov.
