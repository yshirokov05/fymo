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
]


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
        
        # 2. Lazy Import of API to capture remaining import-time crashes
        import api
        with api.app.request_context(req.environ):
            return api.app.full_dispatch_request()
            
    except Exception:
        # 3. Immortal Debugger: Return the actual traceback as JSON
        error_info = {
            "status": "CRASH",
            "error": traceback.format_exc(),
            "env_check": {k: len(os.environ.get(k, "")) for k in ["ANTHROPIC_API_KEY", "FERNET_KEY"]}
        }
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
    try:
        import brief_delivery_service
        result = brief_delivery_service.run_scheduled_delivery()
        logging.info(f"scheduled_morning_briefs complete: {result}")
    except Exception:
        logging.error(f"scheduled_morning_briefs crashed: {traceback.format_exc()}")
