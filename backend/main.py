import os
import json
import traceback
import logging
from firebase_functions import https_fn, scheduler_fn

# Shared secret list — keep in sync between HTTP and scheduled functions.
# RESEND_API_KEY is optional: brief delivery no-ops if it's unset, so the
# project deploys cleanly before the secret is configured.
_SECRETS = [
    "PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV", "PLAID_REDIRECT_URI",
    "GEMINI_API_KEY", "ANTHROPIC_API_KEY",
    "FERNET_KEY",
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID",
    "RESEND_API_KEY", "BRIEF_FROM_EMAIL",
    "SENTRY_DSN",
]


_sentry_started = False

def _init_sentry():
    """Initialize Sentry error monitoring if SENTRY_DSN is configured. No-op
    otherwise, so the app deploys cleanly before the secret is added. Runs at
    most once per warm instance."""
    global _sentry_started
    if _sentry_started:
        return
    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        return
    _sentry_started = True
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=dsn,
            environment=os.environ.get("PLAID_ENV", "production"),
            traces_sample_rate=0.1,
            send_default_pii=False,  # finance app — don't ship PII to the monitor
        )
        logging.info("Sentry initialized")
    except Exception as e:
        logging.warning(f"Sentry init failed (continuing without it): {e}")


@https_fn.on_request(
    region="us-west2",
    memory=1024,
    timeout_sec=300,
    secrets=_SECRETS
)
def api_func(req: https_fn.Request) -> https_fn.Response:
    try:
        # 1. Nuclear Global Sanitization: Clean EVERY environment variable to prevent gRPC Illegal Header crashes.
        for key in list(os.environ.keys()):
            val = os.environ.get(key)
            if isinstance(val, str):
                # Critical: gRPC crashes if ANY header (often derived from env) has a newline.
                clean_val = val.replace("\n", "").replace("\r", "").strip()
                if clean_val != val:
                    os.environ[key] = clean_val
        
        # 1b. Initialize error monitoring (idempotent; no-op without SENTRY_DSN).
        _init_sentry()

        # 2. Lazy Import of API to capture remaining import-time crashes
        import api
        with api.app.request_context(req.environ):
            return api.app.full_dispatch_request()
            
    except Exception:
        # SEC: full tracebacks are gated behind an opt-in flag. Returning
        # traceback.format_exc() to clients by default leaks internal file
        # paths, library versions, and code structure to anyone who can
        # trigger a top-level crash. The traceback is always logged server-side
        # (visible in Cloud Logging); set DEBUG_TRACEBACKS=1 only when you need
        # it echoed back to the client while debugging a deploy.
        tb = traceback.format_exc()
        logging.error(f"Unhandled top-level crash: {tb}")
        if os.environ.get("DEBUG_TRACEBACKS") == "1":
            error_info = {
                "status": "CRASH",
                "error": tb,
                "env_check": {k: len(os.environ.get(k, "")) for k in ["ANTHROPIC_API_KEY", "FERNET_KEY"]}
            }
        else:
            error_info = {"status": "error", "error": "Internal server error."}
        return https_fn.Response(
            json.dumps(error_info),
            status=500,
            mimetype="application/json"
        )


@scheduler_fn.on_schedule(
    schedule="0 13 * * *",  # 13:00 UTC = 6am PT / 9am ET — adjust per your audience
    timezone=scheduler_fn.Timezone("UTC"),
    region="us-west2",
    memory=1024,
    timeout_sec=540,
    secrets=_SECRETS,
)
def scheduled_morning_briefs(event):
    """
    Daily delivery of the AI morning brief to users who opted in.

    Reads /users where morning_brief_email.enabled == True, calls
    advisor_service.morning_brief for each, and sends via Resend.
    Idempotent — checks brief_deliveries/{YYYY-MM-DD} before re-sending.

    No-ops if RESEND_API_KEY is unset, so the function deploys cleanly
    before the email provider is configured.
    """
    for key in list(os.environ.keys()):
        val = os.environ.get(key)
        if isinstance(val, str):
            clean = val.replace("\n", "").replace("\r", "").strip()
            if clean != val:
                os.environ[key] = clean
    _init_sentry()
    try:
        import brief_delivery_service
        result = brief_delivery_service.run_scheduled_delivery()
        logging.info(f"scheduled_morning_briefs complete: {result}")
    except Exception:
        logging.error(f"scheduled_morning_briefs crashed: {traceback.format_exc()}")
