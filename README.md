# Financial Headquarters (FHQ) 🏛️
### *Your Personal Net Worth Command Center*

> [!NOTE]
> **Portfolio Context**: This project was built as a high-performance, production-ready alternative to legacy finance tools. It demonstrates full-stack expertise in React, Python, and AI integration, with a focus on data privacy and complex financial calculations.

**Live Site:** [https://personal-finance-app-18cbc.web.app/](https://personal-finance-app-18cbc.web.app/)

---

## 🛠️ Technical Implementation Highlights

Building a platform that handles live financial data across thousands of institutions required solving several non-trivial engineering challenges:

- **🏗️ 50-State Hybrid Taxation Engine**: Developed a localized tax calculation system (FICA, Federal, and 50-State) that supports W-2/1099 blending, dependents, and standard vs. itemized deductions.
- **🤖 Deterministic AI Data Ingestion**: Implemented a zero-shot CSV/PDF/Image transaction extraction pipeline using **Gemini 1.5 Flash**, enabling users to upload any statement format for instant analysis without manual entry.
- **📉 High-Concurrency Data Sync**: Engineered a parallelized synchronization layer for Plaid accounts and Yahoo Finance tickers to achieve sub-5s dashboard load times across 12,000+ potential institutions.
- **🛡️ Privacy-First Architecture**: Designed around Firebase Auth and Firestore with strict rule-based access, ensuring zero data exposure while maintaining high availability.

---

## 💎 Premium Features
- **🤖 AI Financial Advisor**: Personalized wealth guidance powered by **Google Gemini**, with access to your real-time data.
- **🏦 Automated Financial Sync**: Production-ready integration with 12,000+ institutions via **Plaid**.
- **📈 Investment Tracking**: Live stock and bond price monitoring via `yfinance` with intelligent fallbacks.
- **⚖️ 50-State Tax Engine**: High-accuracy tax liability estimation (2026 codes) for Federal, State, and FICA. Supports W-2/1099 and dependents.
- **📊 Smart Budgeting**: Automated transaction categorization and real-time budget tracking.
- 💰 **Earned Income (YTD)**: Track actual paystubs against projected annual income for precise planning. Includes Gross/Net toggle.
- 📸 **Universal AI Statement Ingestion**: Upload any bank statement (PDF, Image, CSV) for automated transaction extraction via Gemini 1.5 Flash. Zero-shot transaction parsing for non-Plaid users.
- 🛡️ **AI Insurance Audit**: Upload policies (Auto, Home, Health) to automatically extract coverage limits and get personalized AI risk assessments and benefit summaries.
- 📝 **Outstanding Check Tracker**: Keep track of written checks that haven't cleared yet with "Safe-to-Spend" balance logic.

---

- [x] **Performance Optimizations**: Parallelized institution syncs, 300s backend timeout, and localized `yfinance` metadata timeouts for a smoother user experience.
- [x] **AI Analyst Updates**: Fixed context-aware "Morning Brief" hang and localized tax estimation logic.

---

## 📈 Project Metrics
- **Lines of Code (LOC)**: 22,150
- **Total Files**: 92
- **Build Status**: Production (v1.2.1)


## 🚀 Technical Architecture
- **Frontend**: React 19, Tailwind CSS, Lucide Icons, Recharts.
- **Backend**: Python 3.12, Flask, Firebase Cloud Functions (Gen 2).
- **AI**: Google Gemini 1.5 Flash API.
- **Database**: Google Firestore (NoSQL).
- **Integrations**: Plaid Production API, Yahoo Finance API.

---

## 🛠️ Getting Started (For Developers)

### 1. Prerequisites
- Node.js v18+
- Python 3.12
- Firebase CLI (`npm install -g firebase-tools`)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/your-username/financial-headquarters.git

# Frontend Setup
cd frontend
npm install
npm start

# Backend Setup
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

### 3. Environment Configuration
Required Firebase Secrets:
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV` (production/sandbox)
- `PLAID_REDIRECT_URI`
- `GEMINI_API_KEY`

---

## 📅 Roadmap & Progress
We are currently in **Beta (v1.1.0)**.
- [x] Phase 1: Core Tax & Net Worth Engine
- [x] Phase 2: Production Plaid Integration
- [x] Phase 3: AI Advisor & Budget Tracking
- [x] Phase 5: Universal AI Statement Ingestion & Insurance Audit
- [/] Phase 6: Market Launch & Stripe Billing (In Progress)

---
**License**: All rights reserved. Built as a solo project by Yury Shirokov.
