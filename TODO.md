# PerfinLab — To-Do

Working to-do list, kept in the repo so it survives across sessions. Ask Claude
"what's our to-do?" anytime, or just open this file. Newest priorities on top.

_Last updated: 2026-06-03_

## 🔴 Active — Portfolio return accuracy (the goal is EXACT, not "eyeball")
- [ ] **USER ACTION: sync Plaid once** to trigger the one-time historical backfill.
- [ ] After that sync, Claude reads the Cloud Function logs (`[backfill-diag]`) to
      verify reconstructed value matches real holdings, and see if transfers exist.
- [ ] If transfers are present: handle `transfer` transactions in the share-walk so
      transferred-in positions start at their transfer date (not held flat before it).
- [ ] Manual **override for bad Plaid data** — edit shares + cost basis per holding
      (PSIX shows $0 basis and 101 vs 100 shares; cost-basis edit exists, add shares).
- [ ] Stock-split adjustment in reconstruction (edge case — confirm none in window first).

## 🟠 Compliance / legal (do before heavy marketing)
- [ ] Fill the physical mailing address placeholders: `PrivacyPolicy.js`,
      `TermsOfService.js`, and `brief_delivery_service.py` (`PHYSICAL_MAILING_ADDRESS`).
- [ ] Lawyer review of privacy policy + terms (privacy/data + tech-transactions, fintech-aware).
- [ ] **Set the Anthropic Console monthly spend cap** (user-only — required cost backstop).

## 🟠 Email delivery
- [ ] Put a real `RESEND_API_KEY` in Secret Manager + re-add to `_SECRETS` in `main.py`
      (email is a no-op until then).
- [ ] Then test Morning Brief send + one-click unsubscribe.

## 🟡 QA / accessibility
- [ ] Run Lighthouse → Accessibility on the live site; fix the contrast failures it reports.
- [ ] Cowork end-to-end QA pass per `docs/QA_CHECKLIST.md`.
- [ ] EditPortfolio a11y labels for the income/debt/insurance tabs (asset tab is done).

## 🟡 Product / branding
- [ ] Domain + rename decision (candor.money / frankly.money / plainsight.money, or a
      credible .com). Claude runs the full rename once a name is picked.

## 🟢 Infra / housekeeping (deferred, non-blocking)
- [ ] Re-enable Sentry: create `SENTRY_DSN` secret + re-add to `_SECRETS` (removed to keep deploys green).
- [ ] Re-enable Firestore backups: create `BACKUP_BUCKET` + re-add to `_SECRETS`.
- [ ] Local dev only: `npm install` in `frontend/` to fix the `@sentry/react` local build
      (CI/deploys are unaffected — they install fresh).

## ✅ Done (recent)
- Trailing-30-day cash flow + emergency fund (fixed $0 cash flow + bogus "link a bank").
- Snapshots store MARKET value (was cost basis) + taken on dashboard load and sync.
- Historical snapshot backfill: reconstruct daily value from Plaid ledger × historical prices.
- Backfill accuracy instrumentation (`[backfill-diag]` logs).
