# PerfinLab Changelog

Public-facing release notes for [PerfinLab](https://perfinlab.com) — the personal finance app that shows its math.

Format inspired by [Keep a Changelog](https://keepachangelog.com/). Versions follow semver: `MAJOR.MINOR.PATCH`.

---

## [Unreleased]

Tracked for upcoming releases. See the project memory `project_roadmap.md` for the rolling list.

---

## [1.7.0] — 2026-05-14

Major roadmap drop. Eight feature areas, ~4,000 LOC across backend + frontend.

### Added

- **Two-factor authentication (TOTP).** Settings → enable 2FA generates a TOTP secret + QR code (Google Authenticator, Authy, 1Password compatible) and 8 single-use recovery codes. Confirmation code required to enable or disable. Encrypted secret + hashed recovery codes at rest. `/api/2fa/verify` provides step-up authentication for sensitive actions. Login enforcement deferred to a follow-up.
- **Subscription detector.** New Subscriptions tab clusters recurring monthly charges from your transaction history. Active list (charged in last 45 days) + "Possibly cancelled / forgotten" list (>45 days). Per-row "hide" affordance. Shows monthly + annual totals — instant ROI when you cancel one.
- **Tax-loss harvesting.** New panel on the Investments tab identifying open lots currently underwater vs market. Per-lot specificity (which exact shares to consider selling), ST vs LT classified, with a `IRS §1091 wash-sale not enforced` disclaimer.
- **Financial Health Score (0-100).** New Dashboard card aggregating four equally-weighted 25-point components: **savings rate (trailing-3-month rolling)**, emergency fund months, debt-to-asset ratio, asset diversification. Snapshotted daily for trend charting. Color-coded ring + sparkline + expandable component breakdown.
- **Portfolio Calendar.** New panel on the Investments tab showing upcoming dividend ex-dates (with estimated payout = $/share × shares held) and earnings dates (with EPS estimate) for currently-held tickers in the next 30 days. Backed by yfinance with a 12h cache.
- **Net-worth milestone confetti.** Celebratory modal + confetti burst when net worth crosses $10K / $25K / $50K / $100K / $250K / $500K / $1M / $2.5M / $5M / $10M for the first time. Tracked atomically on the user doc so it fires once per threshold.
- **Audit log.** New `/users/{uid}/audit_log` subcollection. Every atomic mutation (cost-basis edit, goal CRUD, 2FA enable/disable, milestone crossing) appends an entry with timestamp + before/after state. New `/api/audit_log` endpoint.
- **Daily morning brief email.** Scheduled Cloud Function runs daily at 13:00 UTC and emails the AI morning brief to opted-in users. Settings → Daily Morning Brief Email controls enable/disable + test send. Resend SDK integration (requires `RESEND_API_KEY` Cloud Functions secret).
- **Mobile responsive pass.** Asset Breakdown + Tax-Loss Harvest tables now hide non-essential columns at small breakpoints. Mobile users see Name + Shares + Value + Gain/Loss; secondary columns reveal at sm / md / lg.

### Changed

- **Atomic Firestore writes for critical mutations.** New transaction-wrapped helpers in `firestore_db.py`: `update_asset_cost_basis_atomic`, `update_goal_atomic`, `create_goal_atomic`, `delete_goal_atomic`, `check_and_mark_milestone`. Concurrent writes (manual edit + Plaid sync) can no longer clobber each other.
- **Cost basis edits use new `/api/asset/cost_basis` PATCH endpoint** with optimistic local update + rollback on failure. Replaces the full assets-array save path for this mutation.
- **Goal CRUD** routed through atomic helpers + audit log.

### Infrastructure

- New backend services: `subscription_service.py`, `tax_loss_service.py`, `health_score_service.py`, `calendar_service.py`, `two_factor_service.py`, `brief_delivery_service.py`.
- New dependencies: `pyotp` (TOTP), `resend` (email), `canvas-confetti` (celebrations), `qrcode.react` (2FA enrollment).
- New scheduled Cloud Function `scheduled_morning_briefs` registered in `main.py` alongside the HTTP `api_func`.

---

## [1.6.0] — 2026-05-14

### Added

- **Investments tab summary header.** New 4-stat panel at the top of the Investments tab showing Portfolio Value, Today's change in **both** $ and %, All-Time Unrealized P/L in both $ and %, and Cost Basis with source label (institution vs manual).
- **Portfolio trend chart.** 90-day area chart on the Investments tab built from your daily `portfolio_snapshots`, with window $ and % deltas and a hover tooltip.
- **1W/1M return fallback.** When yfinance can't price enough of your holdings for the selected window, the Portfolio Return card now falls back to your daily portfolio snapshots and labels the figure "approx" with an explanation tooltip. No more silent N/A.
- **Daily change %** in the AssetTable Investments subtotal row. Per-row already showed both $ and %; the subtotal now does too.
- **Taxable Income Sources breakdown** card on the Tax Projection tab. Itemizes W-2 wages per employer, manual income entries, ST/LT capital gains, retirement and insurance pre-tax deductions, and flags net-paycheck deposits as already-post-tax.

### Changed

- **All AI features now use Claude Sonnet 4.6.** The AI stack is fully consolidated on Claude (chat, briefs, goal guidance, PDF/statement extraction).
- **Dashboard donut charts refined.** Industry & Debt Allocation donuts use a curated Tailwind palette, theme-aware slice strokes for clean separation, larger inner radius hosting a "Total $X.XK" center label.
- **Industry Allocation is full-width** with a sorted **most-to-least** category breakdown panel (color dot · name · % · $ · proportional bar) replacing the old recharts legend that kept re-sorting alphabetically.
- **Asset Breakdown moves below allocation** at full width, so the 10-column Investments table fits without a clunky horizontal scrollbar at typical desktop widths.
- **AssetTable polish.** Section headers gain a colored accent bar (Cash=emerald, Investments=blue, Housing=amber) and an at-a-glance group subtotal. Numerical columns right-align with `tabular-nums`. Treatment chips switch to a modern outlined style.
- **DebtTable density** tightened from `py-4` → `py-2.5` to match the rest of the polish.

### Fixed

- **1W/1M portfolio returns showing N/A.** Backend yfinance fetch was getting silently throttled from Cloud Functions. Concurrency dropped 5 → 3, per-ticker timeout 8s → 15s, with a 5-minute cache and per-ticker logging. 1W window widened 7 → 10 calendar days so weekend syncs find a trading-day anchor.

---

## [1.5.0] — Production baseline

Pre-changelog release. Highlights from the existing feature set:

### Added (historical)

- **AI Analyst** chat (Claude Sonnet, rate-limited 20/hr, SSE streaming, agentic tool-use loop).
- **AI Morning & Health Briefs** with live market pulse (SPY/QQQ/BTC/GLD/TLT).
- **Goals tab** with per-goal Claude AI guidance (15/hr rate limit).
- **Expenditures & Budgeting** with Month / 3Mo / YTD / 12Mo period selector for flexible spending.
- **Tax Projection** with 50-state engine (federal + state + FICA, 2025/2026).
- **Investments tab** with inline cost-basis editing, FIFO realized-gains lot matching, 5yr Plaid investment transaction history.
- **Plaid sync** — YTD bank transactions with pagination, 5yr investment transactions, liabilities.
- **Debts** with institution-aware labeling (Chase CC, Pending Settlement, Margin Loan).
- **Insurance** with manual entry + Claude PDF extraction.
- **Check Tracker** for outstanding checks.
- **Visualizations** — charts and allocation views.
- **Security FAQ** (11-question accordion), **Privacy Policy**, **Terms of Service**.
- **Stripe billing** at $9.99/mo Premium, with `is_authorized` whitelist override.
- **Demo mode** for unauthenticated visitors — full app with sample data.
- **Daily portfolio snapshots** written on every Plaid sync to a `portfolio_snapshots` subcollection.

---

[Unreleased]: https://github.com/yshirokov05/PerfinLab/compare/v1.7.0...HEAD
[1.7.0]: https://github.com/yshirokov05/PerfinLab/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/yshirokov05/PerfinLab/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/yshirokov05/PerfinLab/releases/tag/v1.5.0
