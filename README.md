# Financial Headquarters (FHQ)
### Your Personal Net Worth Command Center

**Live Site:** [https://personal-finance-app-18cbc.web.app](https://personal-finance-app-18cbc.web.app)

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Flask](https://img.shields.io/badge/Flask-Python%203.12-000000?style=flat-square&logo=flask)](https://flask.palletsprojects.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%2B%20Auth-FFCA28?style=flat-square&logo=firebase)](https://firebase.google.com/)
[![Plaid](https://img.shields.io/badge/Plaid-12%2C000%2B%20Institutions-00D64F?style=flat-square)](https://plaid.com/)
[![Gemini](https://img.shields.io/badge/Gemini-1.5%20Flash-4285F4?style=flat-square&logo=google)](https://ai.google.dev/)
**Build:** ![deploy](https://github.com/yshirokov05/Personal-Finance-App-PFA/actions/workflows/deploy.yml/badge.svg)

FHQ is an all-in-one personal finance platform. Connect your bank accounts, track your net worth in real time, get AI-powered financial advice, estimate your tax liability across all 50 states, and understand your debt and investment outlook — all in one place.

---

## Features

### Core Dashboard
- **Net Worth Tracker** — Real-time total across assets, debts, and investments
- **Asset Allocation** — Visual sector breakdown (Technology, Financials, Real Estate, Cash, etc.)
- **Live Investment Prices** — Stock and bond pricing via Yahoo Finance with automatic fallbacks

### Bank Integration
- **Plaid Sync** — Connect 12,000+ US financial institutions with one click
- **Automatic Categorization** — Transactions sorted into budget categories automatically
- **Smart Deduplication** — Pending-to-cleared transaction matching prevents double-counting
- **Universal Statement Upload** — Upload any bank statement (PDF, CSV, image) for AI-powered transaction extraction — no Plaid required

### AI Features
- **AI Financial Advisor** — Contextual financial guidance powered by Google Gemini 1.5 Flash, with access to your real account data
- **Morning Brief** — Time-aware financial health summary with market news
- **AI Insurance Audit** — Upload insurance policies (auto, health, life) for automated coverage extraction and risk assessment
- **AI Document Extraction** — Upload paystubs, tax forms, or statements for instant structured data extraction

### Tax Engine
- **50-State Tax Calculator** — Federal + state + FICA estimates with 2025/2026 bracket data
- **All Filing Statuses** — Single, MFJ, MFS, Head of Household, Qualifying Widow
- **W-2 + 1099 Blending** — Self-employment income, Schedule C deductions, quarterly estimates
- **Historical Income Entry** — Multi-year tax analysis

### Financial Planning
- **Debt Spiral** — See the true cost of minimum payments using Average Daily Balance method
- **Wealth Gap** — Roth vs. Brokerage tax-drag comparison with capital gains impact
- **Cost of Waiting** — Compound interest visualization for investment start ages (20/30/40)
- **Outstanding Check Tracker** — Track uncleared checks with Safe-to-Spend balance logic

### Account Management
- **Income (YTD)** — Paystub entry with gross/net toggle and tax-withheld tracking
- **Retirement Accounts** — 401k, Roth IRA, Traditional IRA, SEP-IRA with contribution tracking
- **Insurance Tracking** — Auto, health, life, umbrella with deductible and coverage limits
- **Budget Manager** — Monthly/quarterly/annual budgets with subscription filtering

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  React 19 Frontend                      │
│          (Tailwind CSS, Recharts, Lucide Icons)         │
└────────────────────┬────────────────────────────────────┘
                     │ REST + Firebase SDK
┌────────────────────▼────────────────────────────────────┐
│              Flask Backend (Python 3.12)                │
│         Firebase Cloud Functions Gen 2 (us-west2)       │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  tax_logic   │  │plaid_service │  │  advisor_    │  │
│  │  50-state    │  │  parallel    │  │  service     │  │
│  │  engine      │  │  sync layer  │  │  (Gemini AI) │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└───────────────┬──────────────┬──────────────────────────┘
                │              │
   ┌────────────▼──┐    ┌──────▼────────┐    ┌──────────────┐
   │   Firestore   │    │   Plaid API   │    │ Yahoo Finance │
   │  (user data,  │    │  (12k+ banks) │    │ (live prices) │
   │  strict rules)│    └───────────────┘    └──────────────┘
   └───────────────┘
```

**Security model:** Each user's data lives in their own Firestore document, keyed by Firebase UID. Firestore rules deny all cross-user access. Plaid tokens are encrypted at rest with Fernet symmetric encryption.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Tailwind CSS, Recharts, Lucide Icons |
| Backend | Python 3.12, Flask, Firebase Cloud Functions (Gen 2) |
| Database | Google Firestore (NoSQL) |
| Auth | Firebase Authentication (email/password + Google OAuth) |
| AI | Google Gemini 1.5 Flash |
| Bank Sync | Plaid Production API |
| Pricing | Yahoo Finance (yfinance) |
| Mobile | iOS + Android via Capacitor |
| CI/CD | GitHub Actions → Firebase Hosting + Functions |

---

## Getting Started (Developers)

### Prerequisites
- Node.js v18+
- Python 3.12
- Firebase CLI: `npm install -g firebase-tools`

### Setup

```bash
# Clone
git clone https://github.com/yshirokov05/Personal-Finance-App-PFA.git
cd Personal-Finance-App-PFA

# Frontend
cd frontend
npm install --legacy-peer-deps
npm start          # Dev server at http://localhost:3000

# Backend (separate terminal)
cd backend
python -m venv venv
source venv/bin/activate     # Mac/Linux
.\venv\Scripts\activate      # Windows
pip install -r requirements.txt
```

### Environment Variables

Firebase Secrets required (set via Firebase Console → Project Settings → Secret Manager):

| Secret | Description |
|--------|-------------|
| `PLAID_CLIENT_ID` | Plaid dashboard client ID |
| `PLAID_SECRET` | Plaid production/sandbox secret |
| `PLAID_ENV` | `production` or `sandbox` |
| `PLAID_REDIRECT_URI` | OAuth redirect URI for Plaid Link |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `FERNET_KEY` | Encryption key for Plaid tokens at rest |

### Deploy

Push to `main` — GitHub Actions deploys automatically. For a manual deploy:

```bash
cd frontend && npm run deploy
```

---

## Roadmap

- [x] Phase 1 — Core Tax & Net Worth Engine
- [x] Phase 2 — Production Plaid Integration
- [x] Phase 3 — AI Advisor & Budget Tracking
- [x] Phase 4 — Performance & AI Stability (parallel sync, deduplication, advisor optimization)
- [x] Phase 5 — Universal AI Statement Ingestion & Insurance Audit
- [ ] Phase 6 — Stripe Billing & Market Launch

---

## License

All rights reserved. © Yury Shirokov. v1.2.1 (Production)
