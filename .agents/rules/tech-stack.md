---
description: Technical Stack Reference
alwaysApply: true
alwaysOn: true
---

# Technical Stack

## Frontend
- **Framework**: React 19 (Create React App)
- **Styling**: Tailwind CSS + CSS variables in `frontend/src/index.css`
- **Charts**: Recharts
- **Icons**: Lucide React
- **HTTP**: Axios
- **Auth**: Firebase SDK (email/password + Google OAuth)
- **Mobile**: Capacitor (iOS + Android)

## Backend
- **Runtime**: Python 3.12, Flask
- **Deployment**: Firebase Cloud Functions (Gen 2), us-west2 region
- **Entry point**: `backend/main.py` → `backend/api.py`
- **Timeout**: 300 seconds (hard limit — do not exceed)

## Database
- **Primary**: Google Firestore (NoSQL)
- **Pattern**: One document per user, keyed by Firebase UID (`/users/{uid}`)
- **Encryption**: Fernet symmetric encryption for sensitive fields (Plaid tokens)
- **Rules**: `firestore.rules` — user data isolation + whitelist-based premium gating

## Auth
- **Provider**: Firebase Authentication
- **Backend verification**: `backend/auth.py` — `@token_required` decorator decodes Firebase JWT

## External APIs
- **Bank data**: Plaid (Production API) — `backend/plaid_service.py`
- **AI**: Anthropic Claude Sonnet 4.6 (`claude-sonnet-4-5`) — `backend/advisor_service.py`. All AI features (chat, briefs, goal guidance, document extraction) use this one model.
- **Stock prices**: Yahoo Finance (yfinance) — `backend/price_service.py`

## CI/CD
- **Pipeline**: GitHub Actions
- **Deploy trigger**: Push to `main` branch or manual `workflow_dispatch`
- **Workflow files**: `.github/workflows/deploy.yml`, `.github/workflows/pr-check.yml`
- **Secret**: `FIREBASE_SERVICE_ACCOUNT` in GitHub repo secrets

## Node / Python Versions
- Node.js: v18+ (v20 used in CI)
- Python: 3.12 (pinned in firebase.json)
