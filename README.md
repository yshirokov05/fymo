# Financial Headquarters (FHQ) 🏛️
### *Your Personal Net Worth Command Center*

Financial Headquarters is a premium, privacy-first personal finance platform designed to replace legacy tools like Mint. It provides a centralized, high-precision dashboard for monitoring net worth, investment performance, and live tax liabilities across all 50 US states.

**Live Site:** [https://personal-finance-app-18cbc.web.app/](https://personal-finance-app-18cbc.web.app/)

---

## 💎 Premium Features
- **🤖 AI Financial Advisor**: Personalized wealth guidance powered by **Google Gemini**, with access to your real-time data.
- **🏦 Automated Financial Sync**: Production-ready integration with 12,000+ institutions via **Plaid**.
- **📈 Investment Tracking**: Live stock and bond price monitoring via `yfinance` with intelligent fallbacks.
- **⚖️ 50-State Tax Engine**: High-accuracy tax liability estimation (2026 codes) for Federal, State, and FICA. Supports W-2/1099 and dependents.
- **📊 Smart Budgeting**: Automated transaction categorization and real-time budget tracking.
- **💰 Earned Income (YTD)**: Track actual paystubs against projected annual income for precise planning. Includes Gross/Net toggle.
- **📸 Gemini OCR Vision**: Upload paystubs, W-2s, and checks for instant, automated data extraction via Gemini 1.5 Flash.
- **📝 Outstanding Check Tracker**: Keep track of written checks that haven't cleared yet with "Safe-to-Spend" balance logic.

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
- [x] Phase 4: Wealth Projection & Gemini OCR Vision Implementation
- [ ] Phase 5: Financial Optimization Alerts
- [ ] Phase 6: Market Launch & Stripe Billing

---
**License**: All rights reserved. Built as a solo project by Yury Shirokov.
