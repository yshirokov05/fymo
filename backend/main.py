import os
import json
import traceback
from firebase_functions import https_fn

@https_fn.on_request(
    region="us-west2",
    memory=1024,
    timeout_sec=300,
    secrets=["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV", "GEMINI_API_KEY", "PLAID_REDIRECT_URI", "FERNET_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"]
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
            "env_check": {k: len(os.environ.get(k, "")) for k in ["GEMINI_API_KEY", "FERNET_KEY"]}
        }
        return https_fn.Response(
            json.dumps(error_info),
            status=500,
            mimetype="application/json"
        )
