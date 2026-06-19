# PerfinLab QA Checklist — post-hardening regression pass

This session made changes that touch auth, rate limiting, data writes, and email.
Those are the **high-regression-risk** areas — test these specifically, not "everything."
Use a real account (Google sign-in is auto-verified; also test a fresh password
signup to exercise the email-verification path).

Smoke test (public, automated): ✅ passing — homepage, /api/health, /api/config,
unsubscribe-bad-token, sitemap all green in production as of this commit.

## 🔴 Highest risk — auth & AI gating (decorators changed this session)
- [ ] **Existing Google user** can still use AI features: AI Analyst chat, "AI guidance" on a goal, document/statement upload, debt card summary. (These flipped from `@token_required` → `@auth_required` + email-verified gate. Google = auto-verified, so should work.)
- [ ] **Fresh password signup** receives a verification email, and BEFORE verifying:
  - [ ] Document upload / goal guidance / card summary return a friendly "verify your email" message (not a crash, not a silent failure).
  - [ ] Dashboard, net worth, charts, budgets still work (those are NOT gated).
- [ ] **After clicking the verify link**, the AI features unlock for that password user.
- [ ] AI Analyst is still premium-gated (free user gets the upgrade prompt).

## 🟠 Data integrity — optimistic concurrency (save path changed)
- [ ] Edit portfolio (add/remove an asset, change income) and Save — succeeds normally.
- [ ] Inline **cost-basis edit** in the Investments table saves and persists (now uses the atomic PATCH endpoint).
- [ ] Two tabs open: save in tab A, then save stale data in tab B → tab B should show "Your data changed elsewhere — reloading" (a 409), NOT silently overwrite. (Edge case; nice to confirm.)

## 🟠 Email (only testable once RESEND_API_KEY is a real key)
- [ ] Settings → enable Daily Morning Brief → "Send test" → email arrives.
- [ ] Email footer shows the physical address (NOT the `[PLACEHOLDER]`) and an Unsubscribe link.
- [ ] Clicking Unsubscribe disables the brief without requiring login; Gmail shows a native one-click unsubscribe button.

## 🟡 New features render with real data
- [ ] Subscriptions tab (recurring-charge detection) loads.
- [ ] Financial Health Score card shows a 0–100 score + breakdown.
- [ ] Tax-Loss Harvest panel on Investments (if any positions are underwater).
- [ ] Portfolio Calendar (dividends/earnings) on Investments.
- [ ] Net-worth milestone confetti (hard to trigger; low priority).

## 🟡 CCPA / privacy
- [ ] Privacy Policy → "Do Not Sell or Share" toggle flips and persists (reloads, GA disabled).
- [ ] With the toggle off, GA debug shows no events firing.

## 🟢 Visual / responsive / a11y (human eyes or Lighthouse)
- [ ] Dark mode: dashboard donuts, asset breakdown, cards look right.
- [ ] Mobile (375px): Investments tables collapse columns cleanly; nav works.
- [ ] Keyboard-only: Tab to skip-link → main; modals close on Escape; toggles operable with Space/Enter.
- [ ] Run **Lighthouse → Accessibility** on https://perfinlab.com and capture the contrast failures (the one criterion not yet measured).

## Billing (Stripe test mode recommended)
- [ ] Subscribe flow → Stripe checkout → returns with `?session=success` → Premium unlocks.
- [ ] Settings → Manage Subscription → Stripe portal opens → cancel works → access persists to period end.
