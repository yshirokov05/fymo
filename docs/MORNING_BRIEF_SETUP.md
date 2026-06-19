# Morning Brief Email — Setup Runbook

The `scheduled_morning_briefs` Cloud Function emails each opted-in user their daily AI morning brief at 13:00 UTC (~6am PT / 9am ET). To activate real delivery you need a Resend API key.

## Current state (as of 2026-05-15)

- `RESEND_API_KEY` secret exists with **placeholder value** (`PLACEHOLDER_set_real_re_key_when_ready`).
- `BRIEF_FROM_EMAIL` secret exists with value `briefs@perfinlab.com`.
- Backend code (`brief_delivery_service.py`) detects placeholder values (anything not starting with `re_`) and no-ops — so the function deploys cleanly but doesn't send.

## To activate real delivery

### Step 1 — Sign up for Resend (free, 2 min)

1. Go to <https://resend.com> and sign up.
2. Dashboard → **API Keys** → **Create API Key**. Name it "PerfinLab Production". Copy the key (starts with `re_`).
3. Free tier: 3,000 emails/month, 100/day. More than enough for daily briefs.

### Step 2 — Pick a sender address

Two options:

**Option A — Use the Resend default test sender (zero DNS setup, works immediately):**

```powershell
"onboarding@resend.dev" | .\node_modules\.bin\firebase.cmd functions:secrets:set BRIEF_FROM_EMAIL --project personal-finance-app-18cbc --data-file -
```

Limitation: `onboarding@resend.dev` can only deliver to **your own verified email** (the one you signed up with). Fine for personal use + testing, not for sending to other users.

**Option B — Verify `perfinlab.com` as a sending domain (~10 min, lets you send to any user):**

1. In Resend dashboard → **Domains** → **Add Domain** → enter `perfinlab.com`.
2. Resend shows you 3 DNS records (MX, TXT for SPF, TXT for DKIM). Add them to your DNS provider (Cloudflare / GoDaddy / wherever `perfinlab.com` is registered).
3. Wait 5–30 min for DNS propagation, then click "Verify" in Resend.
4. The current `BRIEF_FROM_EMAIL` (`briefs@perfinlab.com`) will work once the domain is verified.

### Step 3 — Set the real API key

From `C:\Projects\fymo`:

```powershell
"re_YOUR_REAL_KEY_HERE" | .\node_modules\.bin\firebase.cmd functions:secrets:set RESEND_API_KEY --project personal-finance-app-18cbc --data-file -
```

Verify:

```powershell
.\node_modules\.bin\firebase.cmd functions:secrets:access RESEND_API_KEY --project personal-finance-app-18cbc
```

Should print your real key.

### Step 4 — Redeploy to pick up the new secret value

Secrets are read at function cold-start, so existing instances need to restart. Easiest:

```powershell
# Push any small commit to trigger GitHub Actions:
git commit --allow-empty -m "Refresh secrets" && git push origin main
```

GitHub Actions deploys both `api_func` and `scheduled_morning_briefs` from a clean Ubuntu runner — no local CPU used.

### Step 5 — Test from the app

1. Open <https://perfinlab.com> → **Settings** → **Daily Morning Brief Email** card.
2. Toggle "Daily delivery" **on**.
3. Click "Send me today's brief now (test)".
4. Check your inbox.

If you don't get an email within ~30 seconds, check Cloud Function logs:

```powershell
.\node_modules\.bin\firebase.cmd functions:log --project personal-finance-app-18cbc --only api_func | findstr brief_delivery
```

## Schedule details

- **Cadence:** Daily at 13:00 UTC. Defined in `backend/main.py` (`schedule="0 13 * * *"`).
- **Timezone:** Currently UTC. To change to a specific zone:
  ```python
  timezone=scheduler_fn.Timezone("America/Los_Angeles")
  schedule="0 6 * * *"   # 6am Pacific
  ```
- **Idempotency:** Each user has a `/users/{uid}/brief_deliveries/{YYYY-MM-DD}` doc written on successful send. Re-runs the same day skip already-delivered users.
- **Cost:** 1 Resend send + 1 Claude Sonnet call per user per day. At 100 users that's ~$0.50/month in Anthropic costs and free Resend.

## If the scheduled function isn't appearing in `functions:list`

Most likely cause: Cloud Scheduler API isn't enabled on the project. Firebase usually auto-enables it on first deploy of a scheduled function, but if it fails:

1. Open <https://console.cloud.google.com/apis/library/cloudscheduler.googleapis.com?project=personal-finance-app-18cbc>
2. Click **Enable**.
3. Retry the deploy.

Other possible causes:
- `RESEND_API_KEY` or `BRIEF_FROM_EMAIL` secrets don't exist → check with `firebase functions:secrets:access NAME`. The deploy will silently skip functions whose declared secrets can't be bound.
- Python syntax error in `backend/brief_delivery_service.py` or `backend/main.py` → check the GitHub Actions log for the failing job.

## To turn it back off

Disable per-user from the Settings UI, OR globally by rotating the API key to a placeholder:

```powershell
"DISABLED" | .\node_modules\.bin\firebase.cmd functions:secrets:set RESEND_API_KEY --project personal-finance-app-18cbc --data-file -
```

Anything not starting with `re_` will cause `brief_delivery_service.py` to no-op cleanly.
