import os
import logging
from firebase_admin import auth, firestore
import firebase_admin

def get_secret_diagnostics():
    """
    SEC-D: Diagnostic utility to check the santization status of secrets on the live server.
    Reports metadata (lengths, presence of newlines) without revealing actual secret content.
    """
    secrets_to_check = [
        # Anthropic Claude — sole LLM provider. Required for chat, briefs, goal
        # guidance, card summary, and document extraction.
        "ANTHROPIC_API_KEY",
        # Legacy: GEMINI_API_KEY is no longer used by any code path but is
        # still listed here so the diagnostic endpoint reports its presence
        # if it's still configured in Firebase Secret Manager. Safe to remove
        # both this entry and the secret itself.
        "GEMINI_API_KEY",
        "FERNET_KEY",
        "PLAID_CLIENT_ID",
        "PLAID_SECRET",
        "PLAID_ENV",
        "PLAID_REDIRECT_URI",
    ]
    
    results = {}
    for key in secrets_to_check:
        val = os.environ.get(key, "")
        results[key] = {
            "present": bool(val),
            "raw_length": len(val),
            "has_newline": "\n" in val,
            "has_carriage_return": "\r" in val,
            "stripped_length": len(val.strip()),
            "deep_sanitized_length": len(val.replace("\n", "").replace("\r", "").strip())
        }
    
    # Check Firebase Initialization
    try:
        app = firebase_admin.get_app()
        results["firebase_app"] = {
            "initialized": True,
            "name": app.name,
            "project_id": app.project_id if hasattr(app, 'project_id') else "unknown"
        }
    except Exception as e:
        results["firebase_app"] = {
            "initialized": False,
            "error": str(e)
        }
        
    return results
