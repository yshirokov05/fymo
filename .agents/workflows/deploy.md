---
description: Deploy the Fymo application to Firebase
---

# Deployment

## Automated (Preferred)

Deployment runs automatically via GitHub Actions on every push to `main`.

To trigger a manual deploy from GitHub:
1. Go to the repo on GitHub
2. Click **Actions** tab
3. Click **Deploy to Firebase**
4. Click **Run workflow** → **Run workflow**

## Manual (Fallback)

Use only if GitHub Actions is unavailable.

```bash
cd frontend
npm run deploy
```

This runs `npm run build && npx firebase deploy` and deploys:
- React build → Firebase Hosting
- Python backend → Firebase Cloud Functions
- Security rules → Firestore

## What Gets Deployed

| Target | Source | Command |
|--------|--------|---------|
| Frontend (Hosting) | `frontend/build/` | `firebase deploy --only hosting` |
| Backend (Functions) | `backend/` | `firebase deploy --only functions` |
| Firestore Rules | `firestore.rules` | `firebase deploy --only firestore:rules` |

## Verification

After deploy, confirm at:
- **Site:** https://personal-finance-app-18cbc.web.app
- **Functions:** Firebase Console → Functions → `api-func`

## Required Secrets

All secrets are in Firebase Secret Manager. If a new secret is needed, add it via:
```
firebase functions:secrets:set SECRET_NAME
```

Then redeploy functions.
