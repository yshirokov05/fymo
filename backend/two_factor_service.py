"""
two_factor_service
─────────────────────────────────────────────────────────────────────────────
TOTP-based two-factor authentication enrollment and verification.

Approach: pyotp generates a base32 secret. We Fernet-encrypt it (same key as
Plaid tokens) before persisting to Firestore. Recovery codes are SHA-256
hashed at rest — never reversibly stored. Single-use enforcement is via a
"used" set persisted alongside.

What this DOESN'T do (yet — scoped for a follow-up session):
  • Gate the login flow itself. Firebase Auth handles primary auth; this
    layer adds a "step-up" verification that the frontend can require on
    sensitive actions (data export, delete account, large asset edits).
  • Phone-based SMS MFA (requires Firebase Identity Platform paid upgrade).

What it DOES:
  • /api/2fa/status   — is enrollment active?
  • /api/2fa/setup    — generate secret + QR URI + recovery codes (pending)
  • /api/2fa/verify_setup — confirm enrollment by submitting first code
  • /api/2fa/verify   — verify a code (used for step-up auth on actions)
  • /api/2fa/disable  — turn it off (requires current code or recovery code)
"""

from __future__ import annotations
import os
import re
import hashlib
import secrets
import logging
from typing import Optional

import pyotp


_TOTP_ISSUER = 'PerfinLab'

# Fernet for the TOTP secret — reuses the Plaid encryption key
from cryptography.fernet import Fernet

def _fernet():
    raw_key = os.environ.get('FERNET_KEY')
    if not raw_key:
        return None
    try:
        return Fernet(raw_key.encode() if isinstance(raw_key, str) else raw_key)
    except Exception:
        return None


def _encrypt_secret(secret_b32: str) -> Optional[str]:
    f = _fernet()
    if f is None:
        # Not configured — fail loudly so we don't silently store plaintext
        logging.error("[2fa] FERNET_KEY not configured — refusing to store TOTP secret")
        return None
    return f.encrypt(secret_b32.encode()).decode()


def _decrypt_secret(encrypted_b64: str) -> Optional[str]:
    f = _fernet()
    if f is None:
        return None
    try:
        return f.decrypt(encrypted_b64.encode()).decode()
    except Exception as e:
        logging.error(f"[2fa] failed to decrypt secret: {e}")
        return None


def _hash_recovery_code(code: str) -> str:
    """SHA-256 hash for recovery code storage. Normalized form: uppercase, no dashes."""
    norm = re.sub(r'[^A-Z0-9]', '', code.upper())
    return hashlib.sha256(norm.encode()).hexdigest()


def _generate_recovery_codes(n: int = 8) -> list[str]:
    """Generate N 10-character recovery codes (5+5 with dash). 50 bits of entropy each."""
    codes = []
    alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'  # ambiguous chars removed
    for _ in range(n):
        a = ''.join(secrets.choice(alphabet) for _ in range(5))
        b = ''.join(secrets.choice(alphabet) for _ in range(5))
        codes.append(f"{a}-{b}")
    return codes


def get_status(user_doc: dict) -> dict:
    """Quick status read — does the user have 2FA enabled?"""
    tf = user_doc.get('two_factor') or {}
    return {
        'enabled':           bool(tf.get('enabled')),
        'pending_enrollment': bool(tf.get('pending_secret')) and not tf.get('enabled'),
        'recovery_codes_remaining': len(tf.get('recovery_codes_hashed') or []) - len(tf.get('recovery_codes_used') or []),
    }


def begin_enrollment(user_email: str) -> dict:
    """
    Generate a new TOTP secret + recovery codes. Returns the QR-renderable URI
    and the plaintext recovery codes (these are the ONLY time they're visible
    in plaintext — the caller MUST show them to the user once and never again).

    Doesn't persist anything yet — the caller (api.py) writes the encrypted
    secret + hashed recovery codes via update_user_fields, marked as
    pending until verify_setup is called.
    """
    secret_b32 = pyotp.random_base32()
    totp = pyotp.TOTP(secret_b32)
    uri = totp.provisioning_uri(name=user_email or 'PerfinLab user', issuer_name=_TOTP_ISSUER)
    recovery_plain = _generate_recovery_codes(8)
    return {
        'secret_b32': secret_b32,                  # raw, for storage (after encryption)
        'otpauth_uri': uri,                        # frontend renders as QR
        'recovery_codes_plain': recovery_plain,    # shown ONCE in UI
        'recovery_codes_hashed': [_hash_recovery_code(c) for c in recovery_plain],
    }


def verify_code(secret_b32: str, code: str, valid_window: int = 1) -> bool:
    """Check a 6-digit TOTP code. valid_window=1 allows ±30s drift."""
    if not secret_b32 or not code:
        return False
    code = re.sub(r'\s+', '', code)
    if not code.isdigit() or len(code) != 6:
        return False
    try:
        totp = pyotp.TOTP(secret_b32)
        return totp.verify(code, valid_window=valid_window)
    except Exception:
        return False


def verify_recovery_code(stored_hashed: list[str], used_hashes: list[str], submitted: str) -> Optional[str]:
    """
    Returns the matched hash if the submitted recovery code is valid AND unused,
    else None. Caller is responsible for adding the returned hash to the "used"
    list to enforce single-use.
    """
    if not submitted:
        return None
    submitted_hash = _hash_recovery_code(submitted)
    used = set(used_hashes or [])
    if submitted_hash in (stored_hashed or []) and submitted_hash not in used:
        return submitted_hash
    return None
