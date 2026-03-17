# Firebase Functions entry point
from firebase_functions import https_fn

@https_fn.on_request(
    region="us-west2",
    memory=512,
    secrets=["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV", "GEMINI_API_KEY", "PLAID_REDIRECT_URI", "FERNET_KEY"]
)
def api_func(req: https_fn.Request) -> https_fn.Response:
    import api
    with api.app.request_context(req.environ):
        return api.app.full_dispatch_request()
