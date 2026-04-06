# Financial Headquarters (FHQ)

**Your personal net worth command center.** FHQ is a production-deployed full-stack finance platform that aggregates bank accounts, investments, and tax obligations into a single real-time dashboard — built by one engineer, serving real users.

**Live:** [https://personal-finance-app-18cbc.web.app/](https://personal-finance-app-18cbc.web.app/)

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Flask](https://img.shields.io/badge/Flask-Python%203.12-000000?style=flat-square&logo=flask)](https://flask.palletsprojects.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%2B%20Auth-FFCA28?style=flat-square&logo=firebase)](https://firebase.google.com/)
[![Plaid](https://img.shields.io/badge/Plaid-12%2C000%2B%20Institutions-00D64F?style=flat-square)](https://plaid.com/)
[![Gemini](https://img.shields.io/badge/Gemini-1.5%20Flash-4285F4?style=flat-square&logo=google)](https://ai.google.dev/)
[![LOC](https://img.shields.io/badge/LOC-22%2C150-blue?style=flat-square)](.)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  React 19 Frontend                      │
│          (Tailwind CSS, Recharts, Lucide Icons)         │
└────────────────────┬────────────────────────────────────┘
                     │ REST + Firebase SDK
┌────────────────────▼────────────────────────────────────┐
│              Flask Backend (Python 3.12)                │
│         Firebase Cloud Functions Gen 2 (prod)           │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  tax_logic   │  │plaid_service │  │  statement_  │  │
│  │  50-state    │  │  parallel    │  │  processor   │  │
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

**Data flow:** Firebase Auth → Plaid OAuth links bank accounts → Flask syncs transactions concurrently → Gemini parses uploaded statements → all data persisted in Firestore under per-user security rules.

---

## Key Technical Highlights

- **22,150 lines of code** across 92 files — solo-built from scratch to production deployment
- **50-State Tax Engine** — covers Federal (W-2/1099 blending), FICA, and all 50 state tax codes with dependent credits and standard vs. itemized deductions, accurate to 2026 tax law
- **Sub-5s dashboard loads** — parallelized Plaid sync and Yahoo Finance queries fire concurrently via Python threading; no sequential bottleneck across 12,000+ potential institutions
- **Zero-shot AI statement ingestion** — any bank statement (PDF, image, CSV) parsed by Gemini 1.5 Flash without institution-specific templates; handles format variations across thousands of banks
- **Privacy-first data model** — Firestore security rules enforce strict per-user document isolation at the database layer; cross-user data exposure is architecturally impossible
- **Production Plaid** — not sandbox; live OAuth flow, real institution connections, token refresh handling

---

## Feature Set

| Feature | Implementation |
|---|---|
| Bank account aggregation | Plaid Production API, 12,000+ institutions |
| AI Financial Advisor | Gemini 1.5 Flash with live financial context injected |
| Investment tracking | Yahoo Finance with fallback logic |
| Tax estimation | 50-state engine, Federal + FICA, W-2/1099 blending |
| AI statement ingestion | PDF/image/CSV → structured transactions via Gemini |
| AI insurance audit | Upload policy → extract coverage limits + risk assessment |
| Smart budgeting | Automated transaction categorization + real-time tracking |
| Outstanding check tracker | Safe-to-spend balance logic for uncleared checks |

---

## Setup

### Prerequisites
Node.js v18+, Python 3.12, Firebase CLI (`npm install -g firebase-tools`)

### Local Development
```bash
git clone https://github.com/yshirokov05/Personal-Finance-App-PFA.git

# Frontend
cd frontend && npm install && npm start

# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### Environment Variables (backend/.env)
```
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox           # or production
PLAID_REDIRECT_URI=http://localhost:3000
GEMINI_API_KEY=your_gemini_api_key
```

Firebase service account JSON goes in `backend/firebase_admin_key.json` (gitignored).

---

## Screenshots

| Dashboard | Tax Engine | AI Advisor |
|---|---|---|
| *Net worth + accounts overview* | *50-state tax breakdown* | *Gemini-powered financial chat* |

> Live demo: [personal-finance-app-18cbc.web.app](https://personal-finance-app-18cbc.web.app/)

---

## What I Learned

**Distributed state management at scale.** Keeping Plaid tokens, Firestore documents, and in-memory cache consistent across async Flask workers required careful invalidation logic — a problem that only surfaces in real production, not tutorials.

**LLM reliability engineering.** Getting Gemini to reliably parse statements from thousands of institution formats required systematic output validation and fallback handling. Zero-shot only works when you validate the output.

**Tax law is surprisingly computable.** The 50-state engine required reading actual IRS publications and state revenue department documents and translating legalese into deterministic logic. The edge cases are endless and the authoritative source is always the law, not Stack Overflow.

**The full stack is a system.** React, Flask, Firebase, and three third-party APIs all have independent failure modes. FHQ forced me to think in terms of failure domains and design for partial availability.

---

**Build:** Production v1.2.1 | **License:** All rights reserved | **Author:** Yury Shirokov
