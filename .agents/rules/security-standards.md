---
description: Security Standards
alwaysApply: true
alwaysOn: true
---

# Security Standards

## Credentials & Secrets
- Never hardcode API keys, tokens, passwords, or emails in source code.
- Never commit `.env` files, service account JSON files, or credential files to git.
- All secrets live in Firebase Secret Manager. Access them via `os.environ` in the backend.
- Plaid access tokens must be encrypted with Fernet before writing to Firestore. Use the existing `encrypt_token()` / `decrypt_token()` functions in `firestore_db.py`.

## Authentication
- All routes that modify user data must verify auth via `@token_required` and check that `uid != "guest"`.
- Guest mode (`uid = "guest"`) is intentional for demo — but write operations must explicitly reject it.
- Do not add new unauthenticated write paths.

## Input Validation
- Sanitize all user-supplied input before including it in Gemini prompts. Use `_sanitize_for_ai()` in `advisor_service.py`.
- Never concatenate raw user input into SQL queries, shell commands, or system prompts without sanitization.
- Validate and type-check all data at the API boundary before writing to Firestore.

## CORS
- Do not use `CORS(origins="*")`. Whitelist specific allowed origins.
- Do not combine wildcard origin with `supports_credentials=True` — browsers will block it and it signals misconfiguration.

## Error Handling
- Never return stack traces, internal URLs, or service configuration details in API error responses.
- Return generic error messages to clients (e.g., `{"error": "Internal server error"}`).
- Log full details server-side only.

## Rate Limiting
- Expensive endpoints (Gemini advisor, Plaid sync) must use the Firestore-based rate limiter.
- Default limit: 20 requests/hour per user. Do not raise this without justification.

## Frontend
- Do not hardcode admin emails or user identifiers in frontend JavaScript — they are visible to all users.
- Premium access checks must use the Firestore whitelist, not client-side email comparison.

## Data Privacy
- Do not log PII (names, emails, account numbers, SSNs) in application logs.
- Strip sensitive fields before sending user data to Gemini (see `_sanitize_for_ai()`).
