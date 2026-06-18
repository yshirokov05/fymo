"""
brief_delivery_service
─────────────────────────────────────────────────────────────────────────────
Daily morning brief email delivery. Pairs with `advisor_service.morning_brief`.

How it works:
  1. Cloud Scheduler hits the `scheduled_morning_briefs` function daily at 06:00 UTC
     (~configurable in main.py).
  2. That function iterates over users with `morning_brief_email.enabled = True`.
  3. For each, it calls advisor_service.morning_brief(uid) to generate the brief,
     wraps the markdown in an HTML shell, and sends via Resend.
  4. Successful sends are logged to a `brief_deliveries` subcollection so we
     don't re-send if the function retries.

Requires:
  • RESEND_API_KEY in Cloud Function secrets (user must add this).
  • A verified sender domain in Resend (e.g. briefs@perfinlab.com).

If RESEND_API_KEY is not set, send_brief() is a no-op — safe to deploy without
configuring the email provider; the user can flip the switch later.
"""

from __future__ import annotations
import os
import logging
from datetime import datetime, date


def _resend_client():
    """Lazy-init Resend SDK. Returns None if not configured (no-op mode).
    Real Resend API keys start with 're_' — anything else is treated as a
    placeholder sentinel so the function can deploy with a non-empty secret
    value before the user has signed up for Resend."""
    api_key = os.environ.get('RESEND_API_KEY', '').strip()
    if not api_key or not api_key.startswith('re_'):
        return None
    try:
        import resend
        resend.api_key = api_key
        return resend
    except Exception as e:
        logging.error(f"[brief_delivery] resend SDK init failed: {e}")
        return None


def _markdown_to_html(md: str) -> str:
    """
    Quick-and-dirty markdown → HTML. Brief content is Claude-generated and
    uses a constrained markdown subset: headers (##, ###), bullets, **bold**,
    paragraphs. A full markdown lib (commonmark) would be cleaner but adds
    a dependency for very little benefit at this scale.
    """
    import re
    if not md:
        return ''
    lines = md.split('\n')
    out = []
    in_list = False

    def close_list():
        nonlocal in_list
        if in_list:
            out.append('</ul>')
            in_list = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            close_list()
            continue

        # Headers
        m = re.match(r'^(#{1,6})\s+(.+)$', stripped)
        if m:
            close_list()
            level = len(m.group(1))
            text = m.group(2)
            out.append(f'<h{level} style="margin:24px 0 8px 0;font-family:-apple-system,sans-serif;color:#111827">{text}</h{level}>')
            continue

        # Bullets
        if stripped.startswith(('- ', '* ', '• ')):
            if not in_list:
                out.append('<ul style="margin:8px 0 16px 0;padding-left:20px;font-family:-apple-system,sans-serif;color:#374151">')
                in_list = True
            content = stripped[2:].strip()
            content = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', content)
            out.append(f'<li style="margin-bottom:6px">{content}</li>')
            continue

        # Paragraph
        close_list()
        content = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', stripped)
        out.append(f'<p style="margin:8px 0;font-family:-apple-system,sans-serif;color:#374151;line-height:1.6">{content}</p>')

    close_list()
    return '\n'.join(out)


# CAN-SPAM: every recurring/commercial email MUST carry a valid physical postal
# address. REPLACE this placeholder before enabling email delivery — a fake or
# missing address is itself a CAN-SPAM violation. A PO box or registered-agent
# address is acceptable; you don't have to use a home address.
PHYSICAL_MAILING_ADDRESS = "[YOUR MAILING ADDRESS — REQUIRED BEFORE ENABLING EMAIL]"


def _unsubscribe_serializer():
    from itsdangerous import URLSafeSerializer
    secret = os.environ.get('FERNET_KEY', '') or 'fymo-unsub-fallback'
    return URLSafeSerializer(secret, salt='morning-brief-unsubscribe')


def make_unsubscribe_token(user_id: str) -> str:
    try:
        return _unsubscribe_serializer().dumps(user_id)
    except Exception:
        return ''


def verify_unsubscribe_token(token: str):
    """Return the user_id encoded in a valid unsubscribe token, else None."""
    if not token:
        return None
    try:
        return _unsubscribe_serializer().loads(token)
    except Exception:
        return None


def unsubscribe_url_for(user_id: str) -> str:
    """Non-expiring, signed, no-login unsubscribe link for CAN-SPAM compliance."""
    tok = make_unsubscribe_token(user_id)
    if not tok:
        return "https://perfinlab.com"
    return f"https://perfinlab.com/api/morning_brief/unsubscribe?token={tok}"


def _wrap_email_html(brief_html: str, user_first_name: str = '', unsubscribe_url: str = 'https://perfinlab.com') -> str:
    """Wrap the brief in a minimal email shell. Inline styles only for client compatibility."""
    greeting = f"Good morning{(' ' + user_first_name) if user_first_name else ''},"
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f4f6;padding:40px 0">
  <tr><td align="center">
    <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06)">
      <tr><td style="padding:32px 40px 8px 40px">
        <div style="font-family:-apple-system,sans-serif;font-size:28px;font-weight:900;color:#2563eb;letter-spacing:-0.5px">PerfinLab</div>
        <div style="font-family:-apple-system,sans-serif;font-size:12px;color:#9ca3af;letter-spacing:1px;text-transform:uppercase;margin-top:4px;font-weight:700">Morning brief · {date.today().strftime('%A, %B %-d')}</div>
      </td></tr>
      <tr><td style="padding:16px 40px 32px 40px">
        <p style="font-family:-apple-system,sans-serif;color:#111827;font-size:16px;margin:0 0 16px 0;font-weight:600">{greeting}</p>
        {brief_html}
      </td></tr>
      <tr><td style="padding:24px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
        <a href="https://perfinlab.com" style="font-family:-apple-system,sans-serif;color:#2563eb;text-decoration:none;font-size:13px;font-weight:600">Open PerfinLab →</a>
        <div style="font-family:-apple-system,sans-serif;color:#9ca3af;font-size:11px;margin-top:12px;line-height:1.6">
          You're receiving this because you enabled daily morning briefs in Settings.<br/>
          <a href="{unsubscribe_url}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a>
          &nbsp;·&nbsp;
          <a href="https://perfinlab.com" style="color:#6b7280;text-decoration:underline">Manage email preferences</a>
          <div style="margin-top:8px;color:#b0b6c0">PerfinLab · {PHYSICAL_MAILING_ADDRESS}</div>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


def generate_brief_markdown_for_user(user_id: str) -> str:
    """
    Build the financial_data dict the same way the in-app /api/health_brief
    endpoint does, then call advisor_service.generate_overview to produce the
    morning brief markdown. Returns '' on any failure (logged).
    """
    from firestore_db import get_user_data
    from calculations import calculate_net_worth
    import advisor_service

    try:
        user, incomes, assets, debts, retirement_accounts, insurances, _, _, transactions, paystubs, _, _, _, outstanding_checks, _ = get_user_data(user_id=user_id)
        try:
            from tax_logic import calculate_taxes
            tax_results = calculate_taxes(user.state.name, incomes)
        except Exception:
            tax_results = {}
        nw_result = calculate_net_worth(user, incomes, assets, debts, retirement_accounts, insurances, paystubs)
        financial_data = {
            'real_time_net_worth': nw_result.get('real_time_net_worth', 0),
            'contextual_memory': '',
            'outstanding_checks': [{'amount': c.amount, 'payee': c.payee} for c in outstanding_checks if c.status.name == 'PENDING'],
            'tax_projections': tax_results,
            'transactions': [{'amount': t.amount, 'category': t.category, 'pending': t.pending} for t in transactions[:100]],
            'debts': [{'name': d.name, 'remaining_balance': d.initial_amount - d.amount_paid} for d in debts],
            'insurances': [],
        }
        result = advisor_service.generate_overview(financial_data, brief_type='morning')
        if isinstance(result, dict):
            return result.get('overview') or result.get('brief') or ''
        if isinstance(result, str):
            return result
    except Exception as e:
        logging.error(f"[brief_delivery] generate_brief_markdown_for_user({user_id}) failed: {e}")
    return ''


def send_brief(to_email: str, brief_markdown: str, user_first_name: str = '', unsubscribe_url: str = 'https://perfinlab.com') -> bool:
    """
    Send one user's brief. Returns True on success, False on (logged) failure.
    No-op + returns False when Resend isn't configured.

    CAN-SPAM: includes a visible unsubscribe link + physical address in the body
    (via _wrap_email_html) AND machine-readable List-Unsubscribe headers so Gmail/
    Apple Mail render a native one-click unsubscribe button.
    """
    resend = _resend_client()
    if resend is None:
        logging.info(f"[brief_delivery] skipping send to {to_email} — RESEND_API_KEY not configured")
        return False
    if not to_email or not brief_markdown:
        return False

    from_addr = os.environ.get('BRIEF_FROM_EMAIL', 'PerfinLab <briefs@perfinlab.com>')
    subject = f"Your PerfinLab morning brief · {date.today().strftime('%b %-d')}"
    body_html = _wrap_email_html(_markdown_to_html(brief_markdown), user_first_name, unsubscribe_url)

    try:
        resend.Emails.send({
            'from': from_addr,
            'to': [to_email],
            'subject': subject,
            'html': body_html,
            'headers': {
                # RFC 8058 one-click unsubscribe — required by Gmail/Yahoo bulk-sender rules.
                'List-Unsubscribe': f'<{unsubscribe_url}>',
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
        })
        logging.info(f"[brief_delivery] sent to {to_email}")
        return True
    except Exception as e:
        logging.error(f"[brief_delivery] send failed to {to_email}: {e}")
        return False


def run_scheduled_delivery():
    """
    Top-level orchestrator. Called by the scheduled Cloud Function.
    Iterates over opted-in users and sends each their brief.
    Idempotent within a day — checks brief_deliveries subcollection.
    """
    from firestore_db import get_db
    import advisor_service

    db = get_db()
    if db is None:
        logging.error("[brief_delivery] no Firestore client")
        return {'sent': 0, 'skipped': 0, 'errors': 0}

    today_str = date.today().strftime('%Y-%m-%d')
    sent = 0
    skipped = 0
    errors = 0

    # Find all users with morning brief enabled
    try:
        users = db.collection('users').where('morning_brief_email.enabled', '==', True).stream()
    except Exception as e:
        logging.error(f"[brief_delivery] failed to list opted-in users: {e}")
        return {'sent': 0, 'skipped': 0, 'errors': 1}

    for user_snap in users:
        uid = user_snap.id
        user_data = user_snap.to_dict() or {}
        prefs = user_data.get('morning_brief_email') or {}
        to_email = prefs.get('email') or user_data.get('email')
        if not to_email:
            skipped += 1
            continue

        # Idempotency — skip if already sent today
        try:
            delivery_ref = db.collection('users').document(uid).collection('brief_deliveries').document(today_str)
            if delivery_ref.get().exists:
                skipped += 1
                continue
        except Exception:
            delivery_ref = None

        try:
            md = generate_brief_markdown_for_user(uid)
            if not md:
                skipped += 1
                continue
            first_name = (user_data.get('display_name') or '').split(' ')[0] if user_data.get('display_name') else ''
            success = send_brief(to_email, md, first_name, unsubscribe_url=unsubscribe_url_for(uid))
            if success:
                if delivery_ref:
                    try:
                        delivery_ref.set({'sent_at': datetime.utcnow().isoformat(), 'to': to_email})
                    except Exception:
                        pass
                sent += 1
            else:
                errors += 1
        except Exception as e:
            logging.error(f"[brief_delivery] user {uid} delivery failed: {e}")
            errors += 1

    logging.info(f"[brief_delivery] daily run complete — sent={sent} skipped={skipped} errors={errors}")
    return {'sent': sent, 'skipped': skipped, 'errors': errors}
