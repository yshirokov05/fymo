# API Version: 1.1.1 - Defensive Plaid Sync & 400 Fix
import re
import stripe
from flask import Flask, jsonify, request
from flask_cors import CORS
from price_service import get_current_price, get_multiple_prices, validate_ticker
from calculations import calculate_net_worth
from models import User, Income, Asset, Debt, AssetType, RetirementAccount, AccountType, Insurance, InsuranceFrequency, HourlyType, PlaidItem, Budget, Transaction, Paystub, IncomeType, FilingStatus, USState, TaxTreatment, DebtType, EmploymentType
from firestore_db import get_user_data, save_user_data, get_db, wipe_user_subcollections, save_feedback, ConcurrentModificationError
from auth import token_required, auth_required
import uuid
import plaid_service
import advisor_service
import os
from datetime import datetime, timedelta
import logging
import firestore_db
import statement_processor
from firebase_admin import firestore
import diagnostics_service
from concurrent.futures import ThreadPoolExecutor

app = Flask(__name__)
# SEC: Cap request bodies at 10 MB. Without this, the (formerly guest-reachable)
# document-upload endpoints accept arbitrarily large files, maximizing Claude
# vision token cost per call and risking memory exhaustion. Bank statements /
# paystub photos are well under this. Flask returns 413 automatically when exceeded.
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024
CORS(app, supports_credentials=True, resources={r"/api/*": {
    "origins": [
        "https://personal-finance-app-18cbc.web.app",
        "https://personal-finance-app-18cbc.firebaseapp.com",
        "https://perfinlab.com",
        "https://www.perfinlab.com",
        "http://localhost:3000"
    ],
    "allow_headers": ["Authorization", "Content-Type"],
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}})

stripe.api_key = os.getenv('STRIPE_SECRET_KEY', '').strip()
STRIPE_PRICE_ID = os.getenv('STRIPE_PRICE_ID', '').strip()
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET', '').strip()
APP_URL = "https://personal-finance-app-18cbc.web.app"

def _validate_file_magic(file_bytes: bytes, ext: str) -> bool:
    """Return True if file_bytes header matches the expected type for ext."""
    signatures = {
        '.pdf':  b'%PDF',
        '.png':  b'\x89PNG\r\n\x1a\n',
        '.jpg':  b'\xff\xd8\xff',
        '.jpeg': b'\xff\xd8\xff',
    }
    expected = signatures.get(ext.lower())
    if expected is None:
        return False
    return file_bytes[:len(expected)] == expected

@app.route('/api/diagnostics', methods=['GET'])
@auth_required
def get_diagnostics():
    """SEC-D: Returns health check and secret sanitization status."""
    if request.uid == "guest":
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify(diagnostics_service.get_secret_diagnostics())

# ARCH-4: Simple Firestore-based rate limiting
def _rate_limit_by_key(doc_key, limit_per_hour, fail_closed=False):
    """
    Core sliding-window limiter. Transactional read-modify-write against
    rate_limits/{doc_key} so concurrent requests can't all pass the same
    check (the old plain get()→set() let a parallel burst blow past the cap).
    Returns True if the call is allowed (and records it), False if over limit.
    On DB error: returns `not fail_closed` (deny when fail_closed=True).
    """
    db = get_db()
    if not db:
        return not fail_closed

    now = datetime.utcnow()
    one_hour_ago = now - timedelta(hours=1)
    limit_ref = db.collection('rate_limits').document(doc_key)

    def _to_naive(t):
        try:
            return t.replace(tzinfo=None) if hasattr(t, 'replace') else None
        except Exception:
            return None

    @firestore.transactional
    def _run(transaction):
        snap = limit_ref.get(transaction=transaction)
        usage = []
        if snap.exists:
            for t in (snap.to_dict() or {}).get('calls', []):
                n = _to_naive(t)
                if n and n > one_hour_ago:
                    usage.append(t)
        if len(usage) >= limit_per_hour:
            return False
        usage.append(now)
        transaction.set(limit_ref, {'calls': usage})
        return True

    try:
        return _run(db.transaction())
    except Exception as e:
        logging.error(f"rate limit transaction failed for {doc_key}: {e}")
        return not fail_closed


def check_rate_limit(uid, action, limit_per_hour=20, fail_closed=False):
    """
    Per-user hourly limit. Guests are skipped here, but every EXPENSIVE
    endpoint rejects guests at the decorator (@auth_required) BEFORE reaching
    this function, so the guest skip only applies to cheap, non-AI demo routes.

    Pass fail_closed=True on Claude/Plaid endpoints so a Firestore blip pauses
    spend instead of uncapping it.
    """
    if uid == "guest":
        return True  # Demo-mode reads only; expensive routes are @auth_required
    return _rate_limit_by_key(f"{uid}_{action}", limit_per_hour, fail_closed)


def _client_ip():
    """Best-effort client IP behind the Cloud Functions / Cloud Run proxy.
    X-Forwarded-For is a comma-separated chain; the first entry is the
    original client."""
    xff = request.headers.get('X-Forwarded-For', '') or ''
    if xff:
        return xff.split(',')[0].strip()
    return request.remote_addr or ''


def check_ip_rate_limit(action, limit_per_hour, fail_closed=True):
    """
    Per-IP hourly limit, applied IN ADDITION to the per-user limit on expensive
    AI endpoints. Defends against scripted multi-account abuse from one source:
    even with N freshly-created Firebase accounts, all calls from the same IP
    share this bucket. Set higher than the per-user limit so legitimately
    shared IPs (office/household NAT) aren't blocked by normal use.

    The raw IP is never stored — only a salted SHA-256 hash (PII hygiene).
    """
    ip = _client_ip()
    if not ip:
        return True  # can't identify the source; per-user limit still applies
    import hashlib
    ip_hash = hashlib.sha256(f"fymo-rl::{ip}".encode()).hexdigest()[:24]
    return _rate_limit_by_key(f"ip_{ip_hash}_{action}", limit_per_hour, fail_closed)

def asset_to_dict(asset, price_map=None):
    is_cash_ticker = asset.ticker in ['CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX']
    
    current_price = 1.0
    daily_change_usd = 0.0
    daily_change_percent = 0.0
    sector = 'Financial Services'
    price_unavailable = False

    # If it's not a basic cash account, try to get price and sector
    if (asset.asset_type not in [AssetType.CASH, AssetType.HOUSING, AssetType.SAVINGS, AssetType.CHECKING, AssetType.HIGH_YIELD_SAVINGS] and not is_cash_ticker):
        if price_map and asset.ticker in price_map:
            p_data = price_map[asset.ticker]
        else:
            p_data = get_current_price(asset.ticker)

        if p_data and p_data.get('current_price'):
            current_price = p_data.get('current_price', 1.0)
            daily_change_usd = p_data.get('daily_change_usd', 0.0)
            daily_change_percent = p_data.get('daily_change_percent', 0.0)
            sector = p_data.get('sector', 'Other')
        else:
            # Graceful degradation: yfinance AND the Stooq fallback both failed.
            # Show cost basis (per share) as the price so the position's value ≈
            # what was paid, instead of collapsing to $1.00/share. Flagged so the
            # UI can show a "price unavailable" indicator.
            current_price = asset.cost_basis if (asset.cost_basis or 0) > 0 else 1.0
            sector = 'Other'
            price_unavailable = True
    else:
        # It IS a cash/checking/savings asset
        sector = 'Financial Services'

    return {
        'ticker': asset.ticker,
        'shares': asset.shares,
        'cost_basis': asset.cost_basis,
        'total_gain': getattr(asset, 'total_gain', None),
        'asset_type': asset.asset_type.name,
        'current_price': current_price,
        'daily_change_usd': daily_change_usd,
        'daily_change_percent': daily_change_percent,
        'price_unavailable': price_unavailable,
        'sector': sector,
        'retirement_account_id': getattr(asset, 'retirement_account_id', None),
        'plaid_account_id': getattr(asset, 'plaid_account_id', None),
        'institution_name': getattr(asset, 'institution_name', None),
        'last_price_update': getattr(asset, 'last_price_update', None),
        'official_name': getattr(asset, 'official_name', None),
        'tax_treatment': asset.tax_treatment.name
    }

def income_to_dict(income):
    return {
        'income_type': income.income_type.name,
        'hourly_type': income.hourly_type.name if income.hourly_type else 'REPEATING',
        'amount': income.amount,
        'monthly_income': income.monthly_income,
        'yearly_income': income.amount if income.income_type in [IncomeType.ANNUAL_SALARY, IncomeType.MONTHLY_SALARY, IncomeType.FIXED_TOTAL] else None,
        'hourly_wage': income.hourly_wage,
        'hours_worked': income.hours_worked,
        'year': getattr(income, 'year', 2026),
        'is_net': getattr(income, 'is_net', False)
    }

def debt_to_dict(debt):
    return {
        'name': debt.name,
        'initial_amount': debt.initial_amount,
        'amount_paid': debt.amount_paid,
        'remaining_balance': debt.remaining_balance,
        'monthly_payment': debt.monthly_payment,
        'interest_rate': getattr(debt, 'interest_rate', 0),
        'plaid_account_id': getattr(debt, 'plaid_account_id', None),
        'official_name': getattr(debt, 'official_name', None),
        'benefits': getattr(debt, 'benefits', None),
        'debt_type': debt.debt_type.name
    }

def retirement_account_to_dict(ra):
    return {
        'id': ra.id,
        'name': ra.name,
        'account_type': ra.account_type.name,
        'contributions_2025': ra.contributions_2025,
        'contributions_2026': ra.contributions_2026
    }

def get_insurance_to_dict(ins):
    return {
        'name': ins.name,
        'amount': ins.amount,
        'frequency': getattr(ins.frequency, 'name', str(ins.frequency)),
        'insurance_type': getattr(ins, 'insurance_type', 'Auto'),
        'coverage_summary': getattr(ins, 'coverage_summary', None),
        'deductible': getattr(ins, 'deductible', 0.0),
        'advisor_observations': getattr(ins, 'advisor_observations', None)
    }

def budget_to_dict(b):
    return {
        'id': b.id,
        'category': b.category,
        'limit_amount': b.limit_amount,
        'period': b.period
    }

def transaction_to_dict(t):
    return {
        'id': t.id,
        'amount': t.amount,
        'date': t.date,
        'name': t.name,
        'category': t.category,
        'pending': t.pending,
        'account_id': t.account_id,
        'pending_transaction_id': getattr(t, 'pending_transaction_id', None)
    }

def paystub_to_dict(p):
    return {
        'id': p.id,
        'date': p.date,
        'gross_amount': p.gross_amount,
        'net_amount': p.net_amount,
        'tax_withheld': p.tax_withheld,
        'employer': p.employer,
        'is_net_primary': getattr(p, 'is_net_primary', False),
        'subject_to_fica': getattr(p, 'subject_to_fica', True),
    }

def safe_enum(enum_class, value, default):
    try:
        if not value: return default
        # ARCH-4: Explicitly handle cases where value is already the enum member
        if hasattr(enum_class, '__members__'):
            if value in enum_class.__members__:
                return enum_class[value]
            for member in enum_class:
                if member.value == value:
                    return member
        return default
    except (KeyError, ValueError, TypeError):
        return default

def _require_verified_email():
    """
    Returns (ok, response). ok=False with a 403 JSON response when the caller's
    email is not verified — used to gate expensive free AI features against
    scripted unverified-signup abuse (the rotating-IP multi-account gap that
    per-IP limiting can't fully close). Google/OAuth sign-ins arrive verified,
    so this only adds friction for unverified password signups. Premium-gated
    endpoints (ask_advisor) and auto-fired ones (health_brief) skip this.
    """
    if getattr(request, 'email_verified', False):
        return True, None
    # `error` carries the friendly text (many components surface data.error directly);
    # `code` is the machine-readable tag for components that want to offer a resend action.
    return False, (jsonify({
        'error': "Please verify your email to use AI features — check your inbox for the verification link.",
        'code': 'email_unverified'
    }), 403)


def is_user_authorized(uid, email=None):
    """
    Checks if a user is authorized based on Firestore 'whitelist' collection.
    Real emails are no longer hardcoded for security and professionalism.
    """
    if uid == "guest": return False
    
    db = get_db()
    if not db: return False
    
    # Check if UID is explicitly whitelisted
    whitelist_ref = db.collection('whitelist').document(uid)
    if whitelist_ref.get().exists:
        logging.info(f"Auth Success - UID {uid} in whitelist collection")
        return True
        
    # Check if Email is whitelisted (via separate document or query)
    if email:
        email_for_check = email.lower().strip()
        email_whitelist_query = db.collection('whitelist').where('email', '==', email_for_check).limit(1).get()
        if len(email_whitelist_query) > 0:
            logging.info(f"Auth Success - Email {email_for_check} found in whitelist collection")
            return True
            
        # Also check if the document ID itself is the email
        email_doc_ref = db.collection('whitelist').document(email_for_check)
        if email_doc_ref.get().exists:
            logging.info(f"Auth Success - Email document {email_for_check} found")
            return True

    logging.warning(f"Auth Failed - UID: {uid}, Email: {email}")
    return False


# Per-instance negative cache so genuinely-free users don't trigger a Stripe lookup
# on every dashboard load. {uid: expiry_epoch}. Short TTL; success self-heals the doc.
_stripe_email_negcache = {}
_STRIPE_EMAIL_NEG_TTL = 6 * 3600  # 6h


def resolve_premium_via_stripe_email(uid, email):
    """Last-resort premium resolution by EMAIL.

    Premium is stored per Firebase UID, but a user who signs in with a different
    provider (e.g. Google) gets a different UID than the account their Stripe
    subscription is attached to — so they'd wrongly appear as Free. Stripe customers
    are created with the user's email at checkout, so we can look up an active
    subscription by email and restore premium on the *current* UID.

    Guarded by email_verified at the call site to prevent spoofing. Returns True and
    self-heals the user/whitelist docs when an active subscription is found.
    """
    if not email or not stripe.api_key:
        return False
    import time as _t
    exp = _stripe_email_negcache.get(uid)
    if exp and exp > _t.time():
        return False
    try:
        customers = stripe.Customer.list(email=email.strip(), limit=10)
        for cust in customers.data:
            subs = stripe.Subscription.list(customer=cust.id, status='all', limit=10)
            for sub in subs.data:
                if sub.status in ('active', 'trialing'):
                    db = get_db()
                    if db:
                        db.collection('users').document(uid).set({
                            'is_subscribed': True,
                            'stripe_customer_id': cust.id,
                            'stripe_subscription_id': sub.id,
                            'email': email,
                        }, merge=True)
                        db.collection('whitelist').document(uid).set(
                            {'stripe': True, 'email': email.strip().lower()}, merge=True)
                    logging.info(f"Premium restored via Stripe email match: uid={uid} email={email}")
                    return True
    except Exception as e:
        logging.warning(f"Stripe email premium resolution failed for {uid}: {e}")
    # Remember the miss so we don't re-hit Stripe on every load for a free user.
    _stripe_email_negcache[uid] = _t.time() + _STRIPE_EMAIL_NEG_TTL
    return False

@app.route('/api/auth_status', methods=['GET'])
@auth_required
def get_auth_status():
    email = getattr(request, 'email', None)
    return jsonify({'uid': request.uid, 'email': email, 'is_authorized': is_user_authorized(request.uid, email)})

@app.route('/api/admin/grant_premium', methods=['POST'])
def grant_premium():
    """Admin: comp premium to a person by email (or UID), no Stripe required.

    Writes an EMAIL-keyed whitelist doc so the comp follows the person across every
    login provider and even works before they've signed up — is_user_authorized
    matches a whitelist doc whose id is the email. (Granting only by UID was the bug:
    a later Google login = different UID = comp lost.) Also stamps the user doc when
    the Firebase account already exists, so it reads premium without a Stripe call.
    """
    body = request.get_json(silent=True) or {}
    expected_key = os.getenv('ADMIN_MIGRATION_KEY', '')
    if not expected_key or body.get('admin_key') != expected_key:
        return jsonify({'error': 'Forbidden'}), 403

    email = (body.get('email') or '').strip().lower()
    uid = (body.get('uid') or '').strip()
    if not email and not uid:
        return jsonify({'error': 'Provide email or uid'}), 400

    db = get_db()
    if not db:
        return jsonify({'error': 'DB unavailable'}), 500

    try:
        # 1) Email-keyed whitelist entry — the durable, login-agnostic comp.
        if email:
            db.collection('whitelist').document(email).set(
                {'granted': True, 'email': email, 'comp': True}, merge=True)

        # 2) If the Firebase account already exists, also resolve + stamp its uid so
        #    the dashboard reads premium immediately (and without a Stripe lookup).
        from firebase_admin import auth as fb_auth
        if not uid and email:
            try:
                uid = fb_auth.get_user_by_email(email).uid
            except Exception:
                uid = ''  # not signed up yet — email whitelist still covers them

        if uid:
            db.collection('users').document(uid).set({'is_subscribed': True}, merge=True)
            db.collection('whitelist').document(uid).set(
                {'granted': True, 'email': email, 'comp': True}, merge=True)

        logging.info(f"Admin grant_premium (comp): email={email} uid={uid or '(pending signup)'}")
        return jsonify({'success': True, 'email': email, 'uid': uid, 'pending_signup': not uid})
    except Exception as e:
        logging.error(f"grant_premium error: {e}")
        return jsonify({'error': str(e)}), 500


def _owner_emails():
    """App owners who can comp premium from the in-app panel. Configurable via the
    OWNER_EMAILS secret (comma-separated); defaults to the founder so it works out
    of the box. Server-side only — never trust the client for this."""
    raw = os.getenv('OWNER_EMAILS', 'yshirokov05@gmail.com')
    return {e.strip().lower() for e in raw.split(',') if e.strip()}


def _require_owner():
    email = (getattr(request, 'email', '') or '').lower()
    return bool(email) and email in _owner_emails() and getattr(request, 'email_verified', False)


@app.route('/api/admin/comps', methods=['GET'])
@auth_required
def list_comps():
    """Owner-only: list the emails currently comped (email-keyed whitelist entries)."""
    if not _require_owner():
        return jsonify({'error': 'Forbidden'}), 403
    db = get_db()
    if not db:
        return jsonify({'error': 'DB unavailable'}), 500
    emails = []
    for doc in db.collection('whitelist').where('comp', '==', True).limit(500).get():
        d = doc.to_dict() or {}
        em = (d.get('email') or '').lower()
        # Only surface the email-keyed entries (doc id == email) to avoid uid dupes.
        if em and doc.id == em:
            emails.append(em)
    return jsonify({'comps': sorted(set(emails)), 'is_owner': True})


@app.route('/api/admin/comp', methods=['POST'])
@auth_required
def manage_comp():
    """Owner-only: grant or revoke a comp by email (login-agnostic, signup-optional)."""
    if not _require_owner():
        return jsonify({'error': 'Forbidden'}), 403
    body = request.get_json(silent=True) or {}
    email = (body.get('email') or '').strip().lower()
    action = (body.get('action') or 'grant').lower()
    if not email or '@' not in email:
        return jsonify({'error': 'A valid email is required'}), 400

    db = get_db()
    if not db:
        return jsonify({'error': 'DB unavailable'}), 500

    from firebase_admin import auth as fb_auth
    uid = ''
    try:
        uid = fb_auth.get_user_by_email(email).uid
    except Exception:
        uid = ''  # not signed up yet — the email-keyed comp still covers them

    try:
        if action == 'revoke':
            db.collection('whitelist').document(email).delete()
            if uid:
                db.collection('whitelist').document(uid).delete()
                db.collection('users').document(uid).set({'is_subscribed': False}, merge=True)
            logging.info(f"Owner comp REVOKED: email={email} uid={uid or '(none)'}")
            return jsonify({'success': True, 'email': email, 'action': 'revoke'})

        # grant
        db.collection('whitelist').document(email).set(
            {'granted': True, 'email': email, 'comp': True}, merge=True)
        if uid:
            db.collection('whitelist').document(uid).set(
                {'granted': True, 'email': email, 'comp': True}, merge=True)
            db.collection('users').document(uid).set({'is_subscribed': True}, merge=True)
        logging.info(f"Owner comp GRANTED: email={email} uid={uid or '(pending signup)'}")
        return jsonify({'success': True, 'email': email, 'uid': uid,
                        'action': 'grant', 'pending_signup': not uid})
    except Exception as e:
        logging.error(f"manage_comp error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/migrate_whitelist_to_subscribed', methods=['POST'])
def migrate_whitelist_to_subscribed():
    """One-time migration: stamps is_subscribed=True on users docs for all whitelist entries."""
    body = request.get_json(silent=True) or {}
    expected_key = os.getenv('ADMIN_MIGRATION_KEY', '')
    if not expected_key or body.get('admin_key') != expected_key:
        return jsonify({'error': 'Forbidden'}), 403

    db = get_db()
    whitelist_docs = db.collection('whitelist').get()

    results = {'updated': [], 'skipped': [], 'errors': []}

    for doc in whitelist_docs:
        doc_id = doc.id
        try:
            # UID-keyed doc (from Stripe) — doc ID is a Firebase UID (no @)
            if '@' not in doc_id:
                db.collection('users').document(doc_id).set({'is_subscribed': True}, merge=True)
                results['updated'].append(doc_id)
            else:
                # Email-keyed doc — look up the UID via Firebase Auth
                from firebase_admin import auth as fb_auth
                try:
                    user_record = fb_auth.get_user_by_email(doc_id)
                    db.collection('users').document(user_record.uid).set({'is_subscribed': True}, merge=True)
                    results['updated'].append(doc_id)
                except fb_auth.UserNotFoundError:
                    results['skipped'].append(f"{doc_id} (no Firebase Auth user)")
        except Exception as e:
            results['errors'].append(f"{doc_id}: {str(e)}")

    logging.info(f"Whitelist migration complete: {results}")
    return jsonify(results)

@app.route('/api/create_checkout_session', methods=['POST'])
@token_required
def create_checkout_session():
    if request.uid == 'guest':
        return jsonify({'error': 'Login required to subscribe.'}), 401
    try:
        user = get_user_data(user_id=request.uid)[0]
        email = getattr(request, 'email', None)

        # Reuse existing Stripe customer or create a new one
        customer_id = getattr(user, 'stripe_customer_id', None)
        if not customer_id:
            customer = stripe.Customer.create(
                email=email,
                metadata={'firebase_uid': request.uid}
            )
            customer_id = customer.id

        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=['card'],
            line_items=[{'price': STRIPE_PRICE_ID, 'quantity': 1}],
            mode='subscription',
            allow_promotion_codes=True,
            success_url=f"{APP_URL}?session=success",
            cancel_url=f"{APP_URL}?session=cancel",
            client_reference_id=request.uid,
        )
        return jsonify({'url': session.url})
    except Exception as e:
        logging.error(f"Stripe checkout error for {request.uid}: {e}")
        return jsonify({'error': 'Could not create checkout session.'}), 500


@app.route('/api/stripe_webhook', methods=['POST'])
def stripe_webhook():
    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature', '')
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        logging.warning(f"Stripe webhook verification failed: {e}")
        return jsonify({'error': 'Invalid signature'}), 400

    try:
        db = get_db()
        event_type = event['type']
        logging.info(f"Stripe webhook received: {event_type}")

        if event_type == 'checkout.session.completed':
            session = event['data']['object']
            uid = session.get('client_reference_id')
            if not uid:
                logging.error("checkout.session.completed missing client_reference_id")
                return jsonify({'error': 'No client_reference_id'}), 400
            customer_id = session.get('customer')
            subscription_id = session.get('subscription')
            # Capture the email so premium can be matched by email if the user later
            # signs in with a different provider (different UID). Without this, a
            # Google login after an email/password subscription appears as Free.
            customer_email = (session.get('customer_details') or {}).get('email')
            user_ref = db.collection('users').document(uid)
            user_ref.set({
                'is_subscribed': True,
                'stripe_customer_id': customer_id,
                'stripe_subscription_id': subscription_id,
                'email': customer_email,
            }, merge=True)
            db.collection('whitelist').document(uid).set(
                {'stripe': True, 'email': (customer_email or '').lower()}, merge=True)
            logging.info(f"Subscription activated for uid={uid}")

        elif event_type == 'customer.subscription.deleted':
            subscription = event['data']['object']
            customer_id = subscription.get('customer')
            users = db.collection('users').where('stripe_customer_id', '==', customer_id).limit(1).get()
            for user_doc in users:
                user_doc.reference.set({'is_subscribed': False, 'stripe_subscription_id': None}, merge=True)
                db.collection('whitelist').document(user_doc.id).delete()
                logging.info(f"Subscription cancelled for uid={user_doc.id}")

        elif event_type == 'customer.subscription.updated':
            # Handles plan changes, payment method updates, and cancellations
            # scheduled via the Customer Portal (cancel_at_period_end → eventually deleted).
            subscription = event['data']['object']
            customer_id = subscription.get('customer')
            status = subscription.get('status')
            cancel_at_period_end = subscription.get('cancel_at_period_end', False)
            users = db.collection('users').where('stripe_customer_id', '==', customer_id).limit(1).get()
            for user_doc in users:
                if status in ('active', 'trialing'):
                    # Keep active; note if they've requested end-of-period cancellation
                    user_doc.reference.set({
                        'is_subscribed': True,
                        'stripe_cancel_at_period_end': cancel_at_period_end,
                    }, merge=True)
                    logging.info(f"Subscription updated active for uid={user_doc.id}, cancel_at_period_end={cancel_at_period_end}")
                elif status in ('canceled', 'unpaid'):
                    # Fully revoke — do not revoke on past_due (Stripe retries 3× before deleting)
                    user_doc.reference.set({'is_subscribed': False, 'stripe_subscription_id': None}, merge=True)
                    db.collection('whitelist').document(user_doc.id).delete()
                    logging.info(f"Subscription revoked (status={status}) for uid={user_doc.id}")

        elif event_type == 'invoice.payment_failed':
            invoice = event['data']['object']
            logging.warning(f"Payment failed for customer={invoice.get('customer')}")

    except Exception as e:
        logging.error(f"Stripe webhook handler error for {event.get('type')}: {e}")
        return jsonify({'error': 'Webhook handler error'}), 500

    return jsonify({'status': 'ok'})


@app.route('/api/cancel_subscription', methods=['POST'])
@token_required
def cancel_subscription():
    if request.uid == 'guest':
        return jsonify({'error': 'Not authenticated.'}), 401
    try:
        user = get_user_data(user_id=request.uid)[0]
        subscription_id = getattr(user, 'stripe_subscription_id', None)
        if not subscription_id:
            return jsonify({'error': 'No active subscription found.'}), 404
        stripe.Subscription.modify(subscription_id, cancel_at_period_end=True)
        logging.info(f"Subscription set to cancel at period end for uid={request.uid}")
        return jsonify({'success': True, 'message': 'Your subscription will cancel at the end of the current billing period.'})
    except Exception as e:
        logging.error(f"Cancel subscription error for {request.uid}: {e}")
        return jsonify({'error': 'Could not cancel subscription.'}), 500

@app.route('/api/create_portal_session', methods=['POST'])
@token_required
def create_portal_session():
    """Create a Stripe Customer Portal session so the user can manage their
    subscription (update payment method, download invoices, cancel) without
    us building custom UI for each action."""
    if request.uid == 'guest':
        return jsonify({'error': 'Not authenticated.'}), 401
    try:
        user = get_user_data(user_id=request.uid)[0]
        customer_id = getattr(user, 'stripe_customer_id', None)
        if not customer_id:
            return jsonify({'error': 'No Stripe customer record found. If you subscribed recently, please wait a moment and try again.'}), 404
        portal_session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=APP_URL,
        )
        return jsonify({'url': portal_session.url})
    except Exception as e:
        logging.error(f"Portal session error for {request.uid}: {e}")
        return jsonify({'error': 'Could not open billing portal. Please try again.'}), 500


@app.route('/api/health')
def health_check():
    return jsonify({'status': 'ok'})

@app.route('/api/config/categories', methods=['GET'])
def get_categories_config():
    import json
    try:
        import os
        config_path = os.path.join(os.path.dirname(__file__), 'category_mapping.json')
        with open(config_path, 'r') as f:
            return jsonify(json.load(f))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/portfolio_history', methods=['GET'])
@token_required
def get_portfolio_history():
    """Return recent portfolio_snapshots for the trend chart + period-return math.
    Up to 400 days so period returns (incl. 1Y) can use a real period-start snapshot
    as history accumulates."""
    try:
        db = get_db()
        snaps = db.collection('users').document(request.uid) \
            .collection('portfolio_snapshots') \
            .order_by('date', direction=firestore.Query.DESCENDING) \
            .limit(400) \
            .get()
        # NOTE: `d` is a Firestore DocumentSnapshot, whose .get() takes ONLY a field
        # path — NOT a default. `d.get('total_value', 0)` raises "takes 2 positional
        # arguments but 3 were given", which silently emptied this endpoint (the real
        # reason period returns showed N/A forever). Convert to a plain dict first.
        history = []
        for d in snaps:
            doc = d.to_dict() or {}
            date = doc.get('date')
            val = doc.get('total_value', 0)
            if date and val and val > 0:
                history.append({
                    'date': date,
                    'value': round(val, 2),
                    # 'backfill' = reconstructed estimate, 'live' = exact. Default 'live' for legacy.
                    'source': doc.get('source', 'live'),
                })
        history.sort(key=lambda x: x['date'])
        return jsonify({'history': history})
    except Exception as e:
        # Keep 200 so the frontend degrades gracefully (it treats empty history as
        # "still building"), but log it — a silent failure here makes period returns
        # look perpetually unavailable with no trace of why.
        logging.error(f"portfolio_history failed for {request.uid}: {type(e).__name__}: {e}")
        return jsonify({'history': [], 'error': str(e)}), 200


@app.route('/api/net_worth', methods=['GET'])
@token_required
def get_net_worth():
    try:
        # ARCH-4: Rate limit dashboard hits
        if not check_rate_limit(request.uid, 'net_worth', limit_per_hour=100):
            return jsonify({'error': "Too many requests. Please wait a while."}), 429

        if request.uid == "guest":
            user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, _, _, outstanding_checks, _ = get_user_data(user_id="demo_user")
            ignored_flexible = []
        else:
            user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories, outstanding_checks, ignored_flexible = get_user_data(user_id=request.uid)
        
        tickers = [a.ticker for a in assets]
        price_map = get_multiple_prices(tickers)
        
        net_worth_data = calculate_net_worth(user, incomes, assets, debts, retirement_accounts, insurances, paystubs)
        net_worth_data['assets'] = [asset_to_dict(a, price_map) for a in assets]
        net_worth_data['incomes'] = [income_to_dict(i) for i in incomes]
        net_worth_data['debts'] = [debt_to_dict(d) for d in debts]
        net_worth_data['retirement_accounts'] = [retirement_account_to_dict(ra) for ra in retirement_accounts]
        net_worth_data['insurances'] = [get_insurance_to_dict(ins) for ins in insurances]
        net_worth_data['plaid_items'] = [{'institution_name': pi.institution_name, 'last_sync': pi.last_sync} for pi in plaid_items]
        net_worth_data['budgets'] = [budget_to_dict(b) for b in budgets]
        net_worth_data['transactions'] = [transaction_to_dict(t) for t in (transactions or [])]
        net_worth_data['paystubs'] = [paystub_to_dict(p) for p in paystubs]
        net_worth_data['filing_status'] = user.filing_status.name
        net_worth_data['state'] = user.state.name
        net_worth_data['employment_type'] = getattr(user, 'employment_type', EmploymentType.W2).name
        net_worth_data['business_deductions'] = getattr(user, 'business_deductions', 0.0)
        net_worth_data['dependents'] = getattr(user, 'dependents', 0)
        net_worth_data['outstanding_checks'] = [{'id': c.id, 'amount': c.amount, 'payee': c.payee, 'date_written': c.date_written, 'status': c.status.name, 'plaid_transaction_id': c.plaid_transaction_id} for c in (outstanding_checks or [])]
        # Premium check: combine both signals, self-heal if whitelist says yes but doc says no
        _email = getattr(request, 'email', None)
        _is_subscribed = getattr(user, 'is_subscribed', False)
        _is_authorized = is_user_authorized(request.uid, _email)
        is_premium = _is_subscribed or _is_authorized
        # Cross-login restore: if not premium on THIS uid but a verified email has an
        # active Stripe subscription (under a different uid/login), restore it here.
        if not is_premium and _email and getattr(request, 'email_verified', False):
            if resolve_premium_via_stripe_email(request.uid, _email):
                is_premium = True
        if _is_authorized and not _is_subscribed:
            # Self-heal: stamp the users doc so future reads are consistent
            try:
                _db = get_db()
                if _db:
                    _db.collection('users').document(request.uid).set({'is_subscribed': True}, merge=True)
            except Exception as _e:
                logging.warning(f"Self-heal is_subscribed write failed: {_e}")
        net_worth_data['is_authorized'] = is_premium
        net_worth_data['is_subscribed'] = is_premium
        net_worth_data['ignored_subscription_merchants'] = getattr(user, 'ignored_subscription_merchants', [])
        net_worth_data['manual_subscription_merchants'] = getattr(user, 'manual_subscription_merchants', [])
        net_worth_data['ignored_flexible'] = ignored_flexible
        # Per-account APY (manual or AI-estimated), keyed by account. Small bounded
        # subcollection — empty for most users.
        _apy_map = {}
        try:
            _adb = get_db()
            if _adb and request.uid != 'guest':
                for _d in _adb.collection('users').document(request.uid).collection('account_apy').limit(100).get():
                    _apy_map[_d.id] = (_d.to_dict() or {})
        except Exception as _apy_e:
            logging.warning(f"account_apy read failed: {_apy_e}")
        net_worth_data['account_apy'] = _apy_map
        # Return persisted investment_history from last Plaid sync
        if user.investment_history:
            net_worth_data['investment_history'] = user.investment_history

        # User-entered realized-gains override (from their brokerage, e.g. E*TRADE).
        # Plaid can't see wash sales / transferred lots, so for active traders the
        # broker's figure is ground truth. Optional; null for most users.
        net_worth_data['realized_override'] = None
        try:
            _rdb = get_db()
            if _rdb and request.uid != 'guest':
                _ro = _rdb.collection('users').document(request.uid) \
                    .collection('overrides').document('realized_gains').get()
                if _ro.exists:
                    net_worth_data['realized_override'] = _ro.to_dict() or None
        except Exception as _ro_e:
            logging.warning(f"realized_override read failed: {_ro_e}")

        # Milestone check — if net worth has crossed a new threshold since the
        # last recorded one, surface it so the frontend can fire confetti once.
        # Skipped for guest sessions (no persistent state to mark against).
        net_worth_data['newly_crossed_milestone'] = None
        if request.uid != "guest":
            try:
                from firestore_db import check_and_mark_milestone
                rt_nw = net_worth_data.get('real_time_net_worth') or net_worth_data.get('net_worth') or 0
                crossed = check_and_mark_milestone(request.uid, rt_nw)
                if crossed:
                    net_worth_data['newly_crossed_milestone'] = crossed
            except Exception as _me:
                logging.warning(f"Milestone check failed for {request.uid}: {_me}")

            # Daily market-value snapshot on dashboard load (idempotent — keyed by
            # date, so multiple loads/day just refresh today's value with the latest
            # prices). This builds the daily history the period-return feature needs,
            # without the user having to manually sync. Reuses the price_map we
            # already fetched above (no extra price call). Best-effort.
            try:
                take_portfolio_snapshot(request.uid, assets, price_map=price_map)
            except Exception as _se:
                logging.warning(f"Snapshot on dashboard load failed for {request.uid}: {_se}")

        return jsonify(net_worth_data)
    except Exception as e:
        import traceback
        logging.error(f"DASHBOARD ERROR: {str(e)}")
        logging.error(traceback.format_exc())
        return jsonify({'error': 'Internal server error'}), 500


# ─────────────────────────────────────────────────────────────────────────────
# Atomic mutation endpoints — preferred over full /api/save for narrow updates
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/asset/cost_basis', methods=['PATCH'])
@token_required
def update_asset_cost_basis():
    """
    Atomically update a single asset's cost-per-share. Uses a Firestore
    transaction so a concurrent Plaid sync can't clobber the edit.
    Body: { "plaid_account_id": "...", "cost_basis_per_share": 123.45 }
    """
    if request.uid == "guest":
        return jsonify({'error': 'Please sign in to edit cost basis.'}), 401
    if not check_rate_limit(request.uid, 'cost_basis_update', limit_per_hour=60):
        return jsonify({'error': 'Too many cost basis edits. Try again shortly.'}), 429
    data = request.get_json(silent=True) or {}
    pa_id = data.get('plaid_account_id')
    if not pa_id:
        return jsonify({'error': 'plaid_account_id required'}), 400
    try:
        new_cb = float(data.get('cost_basis_per_share'))
        if new_cb < 0:
            raise ValueError("must be non-negative")
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid cost_basis_per_share'}), 400

    from firestore_db import update_asset_cost_basis_atomic
    success, old_v, new_v = update_asset_cost_basis_atomic(request.uid, pa_id, new_cb)
    if not success:
        return jsonify({'error': 'Asset not found'}), 404
    return jsonify({'success': True, 'previous': old_v, 'current': new_v})


@app.route('/api/audit_log', methods=['GET'])
@token_required
def get_user_audit_log():
    """Return the most recent audit log entries for the authenticated user."""
    if request.uid == "guest":
        return jsonify({'entries': []})
    try:
        limit = min(int(request.args.get('limit', 100)), 500)
    except (TypeError, ValueError):
        limit = 100
    from firestore_db import get_audit_log
    return jsonify({'entries': get_audit_log(request.uid, limit=limit)})


# ─────────────────────────────────────────────────────────────────────────────
# Subscription detector
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# Financial Health Score
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/health_score', methods=['GET'])
@token_required
def get_health_score():
    """Returns the current Financial Health Score + the 90-day history."""
    uid = "demo_user" if request.uid == "guest" else request.uid
    user, incomes, assets, debts, _, _, _, _, transactions, paystubs, _, _, _, _, _ = get_user_data(
        user_id=uid, fields=['transactions', 'paystubs']
    )
    from health_score_service import compute_health_score, take_health_snapshot, get_health_history
    snapshot = compute_health_score(user, incomes, assets, debts, transactions, paystubs)
    db = get_db()
    # Snapshot today's score to the per-user subcollection (idempotent — overwrites
    # any earlier same-day snapshot, so multiple GETs in one day don't pollute)
    if request.uid != "guest":
        take_health_snapshot(db, request.uid, snapshot)
    history = get_health_history(db, request.uid, limit=90) if request.uid != "guest" else []
    return jsonify({'current': snapshot, 'history': history})


# ─────────────────────────────────────────────────────────────────────────────
# Two-factor authentication (TOTP) — enrollment + verification.
# Login enforcement (gating the auth flow itself) is deferred — this layer
# provides "step-up" 2FA the frontend can require on sensitive actions.
# ─────────────────────────────────────────────────────────────────────────────

def _get_user_doc(uid):
    """Read the raw user doc for 2FA state. None if missing/error."""
    db = get_db()
    if db is None:
        return None
    try:
        snap = db.collection('users').document(uid).get()
        return snap.to_dict() if snap.exists else None
    except Exception as e:
        logging.error(f"_get_user_doc failed for {uid}: {e}")
        return None


@app.route('/api/2fa/status', methods=['GET'])
@token_required
def two_factor_status():
    if request.uid == 'guest':
        return jsonify({'enabled': False, 'pending_enrollment': False, 'recovery_codes_remaining': 0})
    from two_factor_service import get_status
    doc = _get_user_doc(request.uid) or {}
    return jsonify(get_status(doc))


@app.route('/api/2fa/setup', methods=['POST'])
@token_required
def two_factor_setup():
    """
    Begin enrollment. Generates a TOTP secret + recovery codes, persists them
    in pending state (encrypted + hashed). Returns the otpauth URI for QR
    rendering and the recovery codes IN PLAINTEXT — this is the only time
    they'll ever be visible, so the frontend MUST display them once.
    """
    if request.uid == 'guest':
        return jsonify({'error': 'Sign in to enable 2FA.'}), 401
    if not check_rate_limit(request.uid, '2fa_setup', limit_per_hour=5):
        return jsonify({'error': 'Too many setup attempts. Try again later.'}), 429

    from two_factor_service import begin_enrollment, _encrypt_secret
    email = getattr(request, 'email', None) or 'user'
    enrollment = begin_enrollment(email)

    encrypted = _encrypt_secret(enrollment['secret_b32'])
    if not encrypted:
        return jsonify({'error': '2FA encryption not configured. Contact support.'}), 500

    db = get_db()
    user_ref = db.collection('users').document(request.uid)
    user_ref.set({
        'two_factor': {
            'pending_secret': encrypted,                              # encrypted, not yet active
            'pending_recovery_hashed': enrollment['recovery_codes_hashed'],
            'pending_started_at': firestore.SERVER_TIMESTAMP,
            'enabled': (user_ref.get().to_dict() or {}).get('two_factor', {}).get('enabled', False),
        }
    }, merge=True)

    return jsonify({
        'otpauth_uri': enrollment['otpauth_uri'],
        'recovery_codes': enrollment['recovery_codes_plain'],
        # NOTE: do NOT return the secret to the client — only the URI which already contains it
    })


@app.route('/api/2fa/verify_setup', methods=['POST'])
@token_required
def two_factor_verify_setup():
    """Complete enrollment by submitting the first TOTP code from the authenticator app."""
    if request.uid == 'guest':
        return jsonify({'error': 'Sign in first.'}), 401
    data = request.get_json(silent=True) or {}
    code = (data.get('code') or '').strip()
    if not code:
        return jsonify({'error': 'Code required'}), 400

    from two_factor_service import verify_code, _decrypt_secret
    doc = _get_user_doc(request.uid) or {}
    tf = doc.get('two_factor') or {}
    pending = tf.get('pending_secret')
    if not pending:
        return jsonify({'error': 'No enrollment in progress. Call /api/2fa/setup first.'}), 400

    secret_b32 = _decrypt_secret(pending)
    if not secret_b32:
        return jsonify({'error': 'Enrollment state corrupted. Restart setup.'}), 500
    if not verify_code(secret_b32, code):
        return jsonify({'error': 'Invalid code. Make sure your authenticator clock is synced.'}), 400

    # Promote pending → active
    db = get_db()
    user_ref = db.collection('users').document(request.uid)
    user_ref.set({
        'two_factor': {
            'enabled': True,
            'secret': pending,                                          # encrypted
            'recovery_codes_hashed': tf.get('pending_recovery_hashed') or [],
            'recovery_codes_used': [],
            'enabled_at': firestore.SERVER_TIMESTAMP,
            'pending_secret': firestore.DELETE_FIELD,
            'pending_recovery_hashed': firestore.DELETE_FIELD,
            'pending_started_at': firestore.DELETE_FIELD,
        }
    }, merge=True)

    # Audit log entry
    try:
        from firestore_db import _write_audit_log
        _write_audit_log(db, request.uid, 'enable', 'two_factor')
    except Exception:
        pass

    return jsonify({'success': True, 'enabled': True})


@app.route('/api/2fa/verify', methods=['POST'])
@token_required
def two_factor_verify():
    """
    Verify a TOTP code or recovery code for step-up authentication on a
    sensitive action. Returns success bool — the calling endpoint is
    responsible for actually enforcing the gate.
    """
    if request.uid == 'guest':
        return jsonify({'success': False})
    if not check_rate_limit(request.uid, '2fa_verify', limit_per_hour=30):
        return jsonify({'error': 'Too many attempts.'}), 429
    data = request.get_json(silent=True) or {}
    code = (data.get('code') or '').strip()
    if not code:
        return jsonify({'error': 'Code required'}), 400

    from two_factor_service import verify_code, verify_recovery_code, _decrypt_secret

    doc = _get_user_doc(request.uid) or {}
    tf = doc.get('two_factor') or {}
    if not tf.get('enabled'):
        return jsonify({'error': '2FA is not enabled.'}), 400

    secret_b32 = _decrypt_secret(tf.get('secret') or '')
    used_recovery = tf.get('recovery_codes_used') or []
    stored_recovery = tf.get('recovery_codes_hashed') or []

    # Try TOTP first
    if secret_b32 and verify_code(secret_b32, code):
        return jsonify({'success': True, 'method': 'totp'})

    # Then recovery code
    matched_hash = verify_recovery_code(stored_recovery, used_recovery, code)
    if matched_hash:
        # Mark used so it can't be reused
        db = get_db()
        user_ref = db.collection('users').document(request.uid)
        user_ref.set({
            'two_factor': {
                'recovery_codes_used': used_recovery + [matched_hash],
            }
        }, merge=True)
        return jsonify({'success': True, 'method': 'recovery', 'codes_remaining': len(stored_recovery) - len(used_recovery) - 1})

    return jsonify({'success': False, 'error': 'Invalid code'}), 401


@app.route('/api/2fa/disable', methods=['POST'])
@token_required
def two_factor_disable():
    """Disable 2FA. Requires a valid TOTP or recovery code in the request body."""
    if request.uid == 'guest':
        return jsonify({'error': 'Not enrolled.'}), 401
    data = request.get_json(silent=True) or {}
    code = (data.get('code') or '').strip()
    if not code:
        return jsonify({'error': 'Confirmation code required to disable 2FA.'}), 400

    from two_factor_service import verify_code, verify_recovery_code, _decrypt_secret
    doc = _get_user_doc(request.uid) or {}
    tf = doc.get('two_factor') or {}
    if not tf.get('enabled'):
        return jsonify({'error': '2FA is not currently enabled.'}), 400

    secret_b32 = _decrypt_secret(tf.get('secret') or '')
    used_recovery = tf.get('recovery_codes_used') or []
    stored_recovery = tf.get('recovery_codes_hashed') or []

    ok = (secret_b32 and verify_code(secret_b32, code)) or verify_recovery_code(stored_recovery, used_recovery, code)
    if not ok:
        return jsonify({'error': 'Invalid confirmation code.'}), 401

    db = get_db()
    user_ref = db.collection('users').document(request.uid)
    user_ref.set({
        'two_factor': {
            'enabled': False,
            'secret': firestore.DELETE_FIELD,
            'recovery_codes_hashed': firestore.DELETE_FIELD,
            'recovery_codes_used': firestore.DELETE_FIELD,
            'enabled_at': firestore.DELETE_FIELD,
        }
    }, merge=True)
    try:
        from firestore_db import _write_audit_log
        _write_audit_log(db, request.uid, 'disable', 'two_factor')
    except Exception:
        pass
    return jsonify({'success': True, 'enabled': False})


# ─────────────────────────────────────────────────────────────────────────────
# Morning brief email — preferences + manual test send
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/morning_brief/preferences', methods=['GET'])
@token_required
def get_morning_brief_preferences():
    if request.uid == 'guest':
        return jsonify({'enabled': False, 'email': None, 'send_test_available': False})
    doc = _get_user_doc(request.uid) or {}
    prefs = doc.get('morning_brief_email') or {}
    return jsonify({
        'enabled': bool(prefs.get('enabled')),
        'email': prefs.get('email') or getattr(request, 'email', None),
        'send_test_available': (os.environ.get('RESEND_API_KEY', '').strip() or '').startswith('re_'),
    })


@app.route('/api/morning_brief/preferences', methods=['PUT'])
@token_required
def update_morning_brief_preferences():
    """Enable/disable daily brief email + override recipient email."""
    if request.uid == 'guest':
        return jsonify({'error': 'Sign in to manage preferences.'}), 401
    data = request.get_json(silent=True) or {}
    enabled = bool(data.get('enabled'))
    email_override = (data.get('email') or '').strip().lower() or None
    db = get_db()
    db.collection('users').document(request.uid).set({
        'morning_brief_email': {
            'enabled': enabled,
            'email': email_override or getattr(request, 'email', None),
            'updated_at': firestore.SERVER_TIMESTAMP,
        }
    }, merge=True)
    return jsonify({'success': True, 'enabled': enabled})


@app.route('/api/morning_brief/unsubscribe', methods=['GET', 'POST'])
def morning_brief_unsubscribe():
    """
    CAN-SPAM / RFC-8058 one-click unsubscribe. NO AUTH by design — the whole point
    is that a recipient can opt out without logging in. The signed token encodes
    the uid; we verify it and flip morning_brief_email.enabled = False. GET returns
    a confirmation page; POST (List-Unsubscribe-Post one-click) returns 200.
    """
    token = request.args.get('token') or (request.form.get('token') if request.form else None)
    from brief_delivery_service import verify_unsubscribe_token
    uid = verify_unsubscribe_token(token)
    if not uid:
        return ("<html><body style='font-family:sans-serif;text-align:center;padding:60px'>"
                "<h2>Invalid or expired unsubscribe link.</h2>"
                "<p>You can manage email preferences in your PerfinLab settings.</p></body></html>",
                400, {'Content-Type': 'text/html'})
    try:
        db = get_db()
        if db:
            db.collection('users').document(uid).set(
                {'morning_brief_email': {'enabled': False}}, merge=True)
    except Exception as e:
        logging.error(f"unsubscribe write failed for {uid}: {e}")
    if request.method == 'POST':
        return ('', 200)  # one-click; mail client doesn't render a body
    return ("<html><body style='font-family:-apple-system,sans-serif;text-align:center;padding:60px;color:#111827'>"
            "<h2>You're unsubscribed.</h2>"
            "<p style='color:#6b7280'>You will no longer receive PerfinLab morning brief emails. "
            "You can re-enable them anytime in Settings.</p>"
            "<a href='https://perfinlab.com' style='color:#2563eb'>Return to PerfinLab</a></body></html>",
            200, {'Content-Type': 'text/html'})


@app.route('/api/morning_brief/send_test', methods=['POST'])
@token_required
def send_test_morning_brief():
    """Trigger a one-off send of today's brief to the user — confirms email pipeline works."""
    if request.uid == 'guest':
        return jsonify({'error': 'Sign in first.'}), 401
    if not check_rate_limit(request.uid, 'morning_brief_test', limit_per_hour=3):
        return jsonify({'error': 'Test send limit reached. Try again in an hour.'}), 429
    _resend_key = os.environ.get('RESEND_API_KEY', '').strip()
    if not _resend_key or not _resend_key.startswith('re_'):
        return jsonify({'error': 'Email service not configured. RESEND_API_KEY must be a real Resend key (starts with re_).'}), 503

    from brief_delivery_service import send_brief, generate_brief_markdown_for_user, unsubscribe_url_for

    doc = _get_user_doc(request.uid) or {}
    prefs = doc.get('morning_brief_email') or {}
    to_email = prefs.get('email') or getattr(request, 'email', None)
    if not to_email:
        return jsonify({'error': 'No email on file.'}), 400

    try:
        md = generate_brief_markdown_for_user(request.uid)
        if not md:
            return jsonify({'error': 'Brief generation returned empty content.'}), 500
        ok = send_brief(to_email, md, unsubscribe_url=unsubscribe_url_for(request.uid))
        if not ok:
            return jsonify({'error': 'Send failed — check function logs.'}), 502
        return jsonify({'success': True, 'sent_to': to_email})
    except Exception as e:
        logging.error(f"send_test_morning_brief failed: {e}")
        return jsonify({'error': 'Internal error generating brief.'}), 500


@app.route('/api/portfolio/calendar', methods=['GET'])
@token_required
def get_portfolio_calendar():
    """
    Return upcoming dividend + earnings events for the user's current holdings.
    Window defaults to 30 days. Heavily cached on the backend (12h per ticker)
    since yfinance is rate-limit sensitive.
    """
    if not check_rate_limit(request.uid, 'portfolio_calendar', limit_per_hour=30):
        return jsonify({'error': 'Rate limit reached. Please wait.'}), 429
    uid = "demo_user" if request.uid == "guest" else request.uid
    user, _, assets, _, _, _, _, _, _, _, _, _, _, _, _ = get_user_data(user_id=uid)
    try:
        days = min(int(request.args.get('days', 30)), 90)
    except (TypeError, ValueError):
        days = 30
    from calendar_service import get_upcoming_events
    return jsonify(get_upcoming_events(assets, days_ahead=days))


@app.route('/api/subscriptions', methods=['GET'])
@token_required
def get_subscriptions():
    """
    Return detected + manual subscriptions. Splits into active (charged in
    last 45 days) and inactive (likely cancelled or forgotten).
    """
    uid = "demo_user" if request.uid == "guest" else request.uid
    user, _, _, _, _, _, _, _, transactions, _, _, _, _, _, _ = get_user_data(
        user_id=uid, fields=['transactions']
    )
    from subscription_service import detect_subscriptions
    ignored = getattr(user, 'ignored_subscription_merchants', []) or []
    manual = getattr(user, 'manual_subscription_merchants', []) or []
    result = detect_subscriptions(transactions, ignored_merchants=ignored, manual_subscriptions=manual)
    return jsonify(result)


@app.route('/api/subscriptions/ignore', methods=['POST'])
@token_required
def ignore_subscription():
    """Add a merchant (normalized name) to the user's ignored-subscription list."""
    if request.uid == "guest":
        return jsonify({'error': 'Sign in to manage subscriptions.'}), 401
    data = request.get_json(silent=True) or {}
    merchant = (data.get('merchant_normalized') or '').strip().lower()
    if not merchant:
        return jsonify({'error': 'merchant_normalized required'}), 400
    db = get_db()
    user_ref = db.collection('users').document(request.uid)

    @firestore.transactional
    def _txn(transaction):
        snap = user_ref.get(transaction=transaction)
        existing = (snap.to_dict() or {}).get('ignored_subscription_merchants', []) or []
        if merchant in existing:
            return existing
        new_list = existing + [merchant]
        transaction.update(user_ref, {'ignored_subscription_merchants': new_list})
        return new_list

    try:
        ignored = _txn(db.transaction())
        return jsonify({'ignored_subscription_merchants': ignored})
    except Exception as e:
        logging.error(f"ignore_subscription failed: {e}")
        return jsonify({'error': 'Internal error'}), 500


@app.route('/api/subscriptions/unignore', methods=['POST'])
@token_required
def unignore_subscription():
    """Remove a merchant from the user's ignored list."""
    if request.uid == "guest":
        return jsonify({'error': 'Sign in to manage subscriptions.'}), 401
    data = request.get_json(silent=True) or {}
    merchant = (data.get('merchant_normalized') or '').strip().lower()
    if not merchant:
        return jsonify({'error': 'merchant_normalized required'}), 400
    db = get_db()
    user_ref = db.collection('users').document(request.uid)

    @firestore.transactional
    def _txn(transaction):
        snap = user_ref.get(transaction=transaction)
        existing = (snap.to_dict() or {}).get('ignored_subscription_merchants', []) or []
        new_list = [m for m in existing if m != merchant]
        transaction.update(user_ref, {'ignored_subscription_merchants': new_list})
        return new_list

    try:
        ignored = _txn(db.transaction())
        return jsonify({'ignored_subscription_merchants': ignored})
    except Exception as e:
        logging.error(f"unignore_subscription failed: {e}")
        return jsonify({'error': 'Internal error'}), 500

@app.route('/api/initialize_sample_data', methods=['POST'])
@token_required
def initialize_sample_data():
    uid = "demo_user" if request.uid == "guest" else request.uid
    """Initializes a user's account with realistic sample data for evaluation."""
    # ARCH-4: Rate limit this to avoid abuse
    if not check_rate_limit(request.uid, 'initialize_sample_data', limit_per_hour=5):
        return jsonify({'error': "Too many initialization requests. Please wait."}), 429

    # 1. Create Sample Income
    sample_income = Income(
        income_type=IncomeType.ANNUAL_SALARY,
        amount=125000,
        monthly_income=125000 / 12,
        year=2026
    )

    # 2. Create Sample Assets
    sample_assets = [
        Asset(
            ticker='CASH',
            shares=15000,
            cost_basis=1.0,
            asset_type=AssetType.CASH,
            institution_name='Chase Bank'
        ),
        Asset(
            ticker='VTI',
            shares=100,
            cost_basis=250.0,
            asset_type=AssetType.STOCK,
            institution_name='Vanguard Portfolio'
        ),
        Asset(
            ticker='Primary Residence',
            shares=450000,
            cost_basis=1.0,
            asset_type=AssetType.HOUSING,
            institution_name='Manual'
        )
    ]

    # 3. Create Sample Debts
    sample_debts = [
        Debt(
            name='Mortgage',
            initial_amount=350000,
            amount_paid=50000,
            monthly_payment=2200,
            interest_rate=0.045
        ),
        Debt(
            name='Car Loan',
            initial_amount=25000,
            amount_paid=10000,
            monthly_payment=450,
            interest_rate=0.029
        )
    ]

    # 4. Create Sample Budgets
    sample_budgets = [
        Budget(id=str(uuid.uuid4()), user_id=uid, category='Grocery', limit_amount=800, period='MONTHLY'),
        Budget(id=str(uuid.uuid4()), user_id=uid, category='Dining', limit_amount=500, period='MONTHLY'),
        Budget(id=str(uuid.uuid4()), user_id=uid, category='Travel', limit_amount=300, period='MONTHLY')
    ]

    # 5. Create Sample Transactions
    import random
    sample_transactions = []
    merchants = [
        ('Safeway', 'Grocery', -150),
        ('Starbucks', 'Dining', -15),
        ('Shell', 'Other', -65),
        ('Apple', 'Other', -1100),
        ('Amazon', 'Other', -120),
        ('Chipotle', 'Dining', -22),
        ('Paycheck', 'Income', 4500)
    ]
    
    for i in range(10):
        m_name, m_cat, m_amt = random.choice(merchants)
        sample_transactions.append(Transaction(
            id=str(uuid.uuid4()),
            user_id=uid,
            account_id='sample_account',
            amount=m_amt + (random.random() * 5),
            date=(datetime.now() - timedelta(days=random.randint(0, 30))).strftime('%Y-%m-%d'),
            name=m_name,
            category=m_cat
        ))

    # Save everything
    user, _, _, _, _, _, plaid_items, _, _, _, custom_rules, _, _, outstanding_checks, ignored_flexible = get_user_data(user_id=uid)
    save_user_data(user, [sample_income], sample_assets, sample_debts, [], [], plaid_items=plaid_items, budgets=sample_budgets, transactions=sample_transactions, outstanding_checks=outstanding_checks, ignored_flexible=ignored_flexible, user_id=uid)

    # Return the new state
    tickers = [a.ticker for a in sample_assets]
    price_map = get_multiple_prices(tickers)
    
    net_worth_data = calculate_net_worth(user, [sample_income], sample_assets, sample_debts, [], [], [])
    net_worth_data['assets'] = [asset_to_dict(a, price_map) for a in sample_assets]
    net_worth_data['incomes'] = [income_to_dict(sample_income)]
    net_worth_data['debts'] = [debt_to_dict(d) for d in sample_debts]
    net_worth_data['outstanding_checks'] = [{'id': c.id, 'amount': c.amount, 'payee': c.payee, 'date_written': c.date_written, 'status': c.status.name, 'plaid_transaction_id': c.plaid_transaction_id} for c in outstanding_checks]
    net_worth_data['is_authorized'] = is_user_authorized(uid, getattr(request, 'email', None))
    
    return jsonify(net_worth_data)

@app.route('/api/portfolio', methods=['PUT'])
@token_required
def update_portfolio():
    data = request.get_json()
    uid = "demo_user" if request.uid == "guest" else request.uid
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories, outstanding_checks, ignored_flexible = get_user_data(user_id=uid)
    # OCC: snapshot the doc version at read time. If another writer (second tab,
    # Plaid sync) commits before our save, save_user_data raises and we 409 instead
    # of silently clobbering their write.
    _rev_at_read = getattr(user, 'rev', 0)
    # Capture current paystubs before modifications (used to detect deletions below)
    _paystubs_before_save_ids = {p.id for p in paystubs}
    _paystubs_before_save_map = {p.id: p for p in paystubs}
    _paystubs_before_save = _paystubs_before_save_ids  # alias used below

    if 'retirement_accounts' in data:
        try:
            retirement_accounts = [
                RetirementAccount(
                    id=ra_data.get('id') or str(uuid.uuid4()), 
                    name=ra_data.get('name', 'Unnamed Account'), 
                    account_type=safe_enum(AccountType, ra_data.get('account_type'), AccountType.TRADITIONAL_IRA), 
                    contributions_2025=float(ra_data.get('contributions_2025', 0)), 
                    contributions_2026=float(ra_data.get('contributions_2026', 0))
                ) for ra_data in data['retirement_accounts']
            ]
        except Exception as e:
            logging.error(f"Error mapping retirement accounts: {e}, Data: {data.get('retirement_accounts')}")
            return jsonify({'error': 'Invalid retirement account data format'}), 400

    if 'insurances' in data:
        insurances = [
            Insurance(
                name=ins_data['name'], 
                amount=float(ins_data.get('amount', 0)), 
                frequency=safe_enum(InsuranceFrequency, ins_data['frequency'], InsuranceFrequency.MONTHLY),
                insurance_type=ins_data.get('insurance_type', 'Auto'),
                deductible=float(ins_data.get('deductible', 0)),
                coverage_summary=ins_data.get('coverage_summary'),
                advisor_observations=ins_data.get('advisor_observations'),
                last_audit_date=ins_data.get('last_audit_date', datetime.now().isoformat())
            ) for ins_data in data['insurances']
        ]

    if 'assets' in data:
        # SELL DETECTION & CAPITAL GAINS AUTOMATION
        # compare with current assets to detect sales
        new_income_entries = []
        for asset_data in data['assets']:
            ticker = asset_data.get('ticker', '').upper()
            new_shares = float(asset_data.get('shares', 0))
            
            # Find matching existing asset
            matching = next((a for a in assets if a.ticker == ticker), None)
            if matching and new_shares < matching.shares:
                # Potential sell
                qty_sold = matching.shares - new_shares
                price_data = get_current_price(ticker)
                curr_price = price_data.get('current_price', matching.cost_basis) # Fallback to basis if price unknown
                
                realized_gain = (curr_price - matching.cost_basis) * qty_sold
                if realized_gain != 0:
                    new_income = Income(
                        income_type=IncomeType.CAPITAL_GAINS,
                        amount=realized_gain,
                        year=datetime.now().year,
                        description=f"Realized gain from {ticker} sale"
                    )
                    new_income_entries.append(new_income)
                    logging.info(f"Auto-detected sale of {qty_sold} shares of {ticker}. Realized gain: ${realized_gain}")
        
        incomes.extend(new_income_entries)

        incoming_assets = []
        for asset_data in data['assets']:
            _shares = float(asset_data.get('shares', 0))
            _cost_basis = float(asset_data.get('cost_basis', 0))
            _asset_type = asset_data.get('asset_type', '')
            # Allow negative shares only for MARGIN/SHORT positions (handled separately)
            # For all standard assets, reject negative shares or negative cost basis
            if _asset_type not in ('MARGIN', 'SHORT') and (_shares < 0 or _cost_basis < 0):
                return jsonify({'error': f"Invalid data: shares and cost basis must be non-negative for {asset_data.get('ticker', 'unknown')}"}), 400
            
            incoming_assets.append(Asset(
                ticker=asset_data.get('ticker', '').upper(),
                shares=_shares,
                cost_basis=_cost_basis,
                total_gain=float(asset_data.get('total_gain', 0)) if asset_data.get('total_gain') is not None else None,
                asset_type=safe_enum(AssetType, asset_data.get('asset_type'), AssetType.STOCK),
                retirement_account_id=asset_data.get('retirement_account_id'),
                plaid_account_id=asset_data.get('plaid_account_id'),
                institution_name=asset_data.get('institution_name', 'Manual'),
                tax_treatment=safe_enum(TaxTreatment, asset_data.get('tax_treatment'), TaxTreatment.TAXABLE)
            ))
        
        # The frontend sends the complete, authoritative asset list from EditPortfolio.
        # Use it directly — no merge with old Firestore state (that caused doubling).
        assets = incoming_assets

    if 'incomes' in data:
        incomes = []
        for income_data in data['incomes']:
            income_type = safe_enum(IncomeType, income_data['income_type'], IncomeType.ANNUAL_SALARY)
            income = Income(
                income_type=income_type, 
                amount=float(income_data.get('amount', 0) or income_data.get('yearly_income', 0)), 
                year=int(income_data.get('year', 2026)),
                description=income_data.get('description'),
                is_net=income_data.get('is_net', False)
            )
            if income_type == IncomeType.ANNUAL_SALARY:
                income.amount = float(income_data.get('yearly_income', 0))
                income.monthly_income = income.amount / 12
            elif income_type == IncomeType.MONTHLY_SALARY:
                income.monthly_income = float(income_data.get('monthly_income', 0))
                income.amount = income.monthly_income * 12
            elif income_type == IncomeType.HOURLY:
                income.amount = float(income_data.get('hourly_wage', 0)) * float(income_data.get('hours_worked', 0)) * (52 if income_data.get('hourly_type') == 'REPEATING' else 1)
                income.hourly_wage, income.hours_worked = float(income_data.get('hourly_wage', 0)), float(income_data.get('hours_worked', 0))
                income.hourly_type = safe_enum(HourlyType, income_data.get('hourly_type'), HourlyType.REPEATING)
            elif income_type == IncomeType.FIXED_TOTAL:
                income.amount = float(income_data.get('amount', 0))
                income.monthly_income = income.amount / 12
            elif income_type in [IncomeType.DIVIDENDS, IncomeType.CAPITAL_GAINS]:
                income.amount = float(income_data.get('amount', 0))
                income.monthly_income = income.amount / 12
            incomes.append(income)

    if 'debts' in data:
        debts = [Debt(
            name=debt_data['name'] or 'Unnamed Debt', 
            initial_amount=float(debt_data.get('initial_amount', 0)), 
            amount_paid=float(debt_data.get('amount_paid', 0)), 
            monthly_payment=float(debt_data.get('monthly_payment', 0)), 
            interest_rate=float(debt_data.get('interest_rate', 0)), 
            plaid_account_id=debt_data.get('plaid_account_id'),
            benefits=debt_data.get('benefits'),
            debt_type=safe_enum(DebtType, debt_data.get('debt_type'), DebtType.INSTALLMENT)
        ) for debt_data in data['debts']]

    if 'budgets' in data:
        uid_for_ids = "demo_user" if request.uid == "guest" else request.uid
        budgets = [Budget(id=b.get('id', str(uuid.uuid4())), user_id=uid_for_ids, category=b['category'], limit_amount=float(b['limit_amount']), period=b.get('period', 'MONTHLY')) for b in data['budgets']]

    if 'paystubs' in data:
        uid_for_ids = "demo_user" if request.uid == "guest" else request.uid
        paystubs = [Paystub(id=p.get('id', str(uuid.uuid4())), user_id=uid_for_ids, date=p['date'], gross_amount=float(p['gross_amount']), net_amount=float(p.get('net_amount', 0)), tax_withheld=float(p.get('tax_withheld', 0)), employer=p.get('employer'), is_net_primary=bool(p.get('is_net_primary', False)), subject_to_fica=bool(p.get('subject_to_fica', True))) for p in data['paystubs']]

    if 'outstanding_checks' in data:
        from models import OutstandingCheck, CheckStatus
        uid_for_ids = "demo_user" if request.uid == "guest" else request.uid
        outstanding_checks = []
        for c in data['outstanding_checks']:
            outstanding_checks.append(OutstandingCheck(
                id=c.get('id', str(uuid.uuid4())),
                user_id=uid_for_ids,
                amount=float(c['amount']),
                payee=c['payee'],
                date_written=c['date_written'],
                status=safe_enum(CheckStatus, c.get('status'), CheckStatus.PENDING),
                plaid_transaction_id=c.get('plaid_transaction_id')
            ))

    if 'ignored_flexible' in data:
        ignored_flexible = data['ignored_flexible']

    if data.get('clear_all_transactions'):
        transactions = []
        
    if data.get('clear_all_data'):
        incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs = [], [], [], [], [], [], [], [], []
        wipe_user_subcollections(uid)

    if data.get('clear_orphaned_plaid'):
        # Keep only data that belongs to a CURRENTLY active Plaid Item
        active_institution_names = {pi.institution_name for pi in plaid_items if pi.institution_name}
        
        # Debts usually have the name of the bank in them or the institution_name field
        debts = [d for d in debts if not d.plaid_account_id or (getattr(d, 'institution_name', None) in active_institution_names)]
        
        # Assets
        assets = [a for a in assets if not a.plaid_account_id or a.institution_name in active_institution_names]
        
        # Transactions (we can't easily map account_id back to institution without a Plaid call, 
        # but we can filter by the institution names we have in the items if we were thorough)
        # For now, let's keep it simple: if clearing orphaned, just keep manual ones or ones where we are SURE.
        # Actually, let's just keep the active institution's transactions if we can.
        # This is complex, so let's stick to Assets and Debts which are the main "ghost" issues.

    # Track any paystubs the user explicitly deleted so Plaid sync won't re-add them
    _paystubs_after_save = {p.id for p in paystubs}
    _newly_excluded_ids = _paystubs_before_save_ids - _paystubs_after_save
    if _newly_excluded_ids:
        _extra_excluded_ids = set()
        _extra_excluded_employers = set()
        for pid in _newly_excluded_ids:
            deleted = _paystubs_before_save_map.get(pid)
            if deleted and deleted.employer:
                emp_lower = deleted.employer.lower().strip()
                # Block by employer name — most reliable since Plaid transaction IDs
                # can differ (pending→cleared) or the transaction may not be in Firestore
                _extra_excluded_employers.add(emp_lower)
                # Also try ID-based exclusion via transaction lookup
                for t in transactions:
                    if emp_lower in t.name.lower():
                        _extra_excluded_ids.add(f"paystub_{t.id}")
        user.excluded_paystub_ids = list(
            set(getattr(user, 'excluded_paystub_ids', [])) | _newly_excluded_ids | _extra_excluded_ids
        )
        user.excluded_paystub_employers = list(
            set(getattr(user, 'excluded_paystub_employers', [])) | _extra_excluded_employers
        )
        logging.info(f"Permanently excluding paystub IDs: {_newly_excluded_ids | _extra_excluded_ids}, employers: {_extra_excluded_employers}")

        # Hard-delete removed paystubs from the subcollection so get_user_data
        # doesn't reload them on the next request (subcollection persists across saves).
        try:
            _db = get_db()
            if _db:
                _user_ref = _db.collection('users').document(uid)
                _del_batch = _db.batch()
                for _pid in _newly_excluded_ids:
                    _del_batch.delete(_user_ref.collection('paystubs').document(_pid))
                _del_batch.commit()
                logging.info(f"Deleted {len(_newly_excluded_ids)} paystub(s) from subcollection: {_newly_excluded_ids}")
        except Exception as _e:
            logging.error(f"Failed to delete paystubs from subcollection: {_e}")

    try:
        save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, outstanding_checks=outstanding_checks, ignored_flexible=ignored_flexible, user_id=uid, expected_rev=_rev_at_read)
    except ConcurrentModificationError:
        # Another writer (second tab or a Plaid sync) committed since we read.
        # Refuse to clobber — tell the client to refetch and retry.
        logging.warning(f"Concurrent modification on portfolio save for {uid}; returning 409")
        return jsonify({
            'error': 'conflict',
            'message': "Your data was updated elsewhere (another tab or a bank sync). Reloading the latest — please re-apply your change."
        }), 409

    price_map = get_multiple_prices([a.ticker for a in assets])
    
    net_worth_data = calculate_net_worth(user, incomes, assets, debts, retirement_accounts, insurances, paystubs)
    net_worth_data['assets'] = [asset_to_dict(a, price_map) for a in assets]
    net_worth_data['incomes'] = [income_to_dict(i) for i in incomes]
    net_worth_data['debts'] = [debt_to_dict(d) for d in debts]
    net_worth_data['retirement_accounts'] = [retirement_account_to_dict(ra) for ra in retirement_accounts]
    net_worth_data['insurances'] = [get_insurance_to_dict(ins) for ins in insurances]
    net_worth_data['plaid_items'] = [{'institution_name': pi.institution_name, 'last_sync': pi.last_sync} for pi in plaid_items]
    net_worth_data['budgets'] = [budget_to_dict(b) for b in budgets]
    net_worth_data['transactions'] = [transaction_to_dict(t) for t in transactions]
    net_worth_data['paystubs'] = [paystub_to_dict(p) for p in paystubs]
    net_worth_data['outstanding_checks'] = [{'id': c.id, 'amount': c.amount, 'payee': c.payee, 'date_written': c.date_written, 'status': c.status.name, 'plaid_transaction_id': c.plaid_transaction_id} for c in outstanding_checks]
    _is_authorized = is_user_authorized(uid, getattr(request, 'email', None))
    _is_subscribed = getattr(user, 'is_subscribed', False)
    _is_premium = _is_subscribed or _is_authorized
    net_worth_data['is_authorized'] = _is_premium
    net_worth_data['is_subscribed'] = _is_premium
    net_worth_data['ignored_flexible'] = ignored_flexible
    return jsonify(net_worth_data)

@app.route('/api/plaid_sync', methods=['POST'])
@auth_required
def plaid_sync():
    if not is_user_authorized(request.uid, getattr(request, 'email', None)):
        return jsonify({'error': "Access restricted."}), 403
        
    # ARCH-4: Rate Limiting
    if not check_rate_limit(request.uid, 'plaid_sync', limit_per_hour=15):
        return jsonify({'error': "Sync limit reached. You can sync up to 5 times per hour."}), 429

    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories, outstanding_checks, ignored_flexible = get_user_data(user_id=request.uid)
    if not plaid_items: return jsonify({'error': "No linked accounts found."}), 404
    
    # 0. PRE-SYNC ORPHAN CLEANUP: Remove any cached assets that belong to institutions 
    # that are no longer in the user's active Plaid item list.
    active_institutions = {pi.institution_name for pi in plaid_items if pi.institution_name}
    assets = [a for a in assets if not a.plaid_account_id or a.institution_name in active_institutions or not a.institution_name]
    debts = [d for d in debts if not d.plaid_account_id or d.institution_name in active_institutions or not d.institution_name]
    
    try:
        all_new_assets, all_new_ra, all_new_transactions, all_new_debts, all_new_paystubs, all_new_incomes = [], [], [], [], [], []
        synced_ids_total = []
        # Combined investment-transaction ledger across ALL Plaid items, so the
        # snapshot backfill can reconstruct against the full portfolio (not per-item).
        all_inv_txns = []
        combined_inv_sec_map = {}
        PERIOD_KEYS = ('1w', '1m', 'ytd', '1y', '2y', '5y', 'all')
        combined_investment_history = {
            'current_value': 0.0,
            'total_cost_basis': 0.0,
            'earliest_date': None,
            'transaction_count': 0,
            'total_fees': 0.0,
            'periods': {p: {'invested': 0.0, 'proceeds': 0.0, 'dividends': 0.0} for p in PERIOD_KEYS},
            'by_account': {},
            'benchmarks': {},
            'period_returns': {},
            # Accumulator for value-weighted period returns across institutions
            '_pr_accum': {},  # {pk: {'sum': Σ(ret×mv), 'wt': Σmv}}
            'realized_gains': {
                'total_realized': 0.0,
                'total_st': 0.0,
                'total_lt': 0.0,
                'periods': {p: {'total': 0.0, 'st': 0.0, 'lt': 0.0, 'count': 0} for p in PERIOD_KEYS},
                'by_year': {},
                'by_ticker': {},
                'unmatched_proceeds': 0.0,
                'unmatched_count': 0,
                'sell_count': 0,
                'earliest_txn_date': None,
                'stock_total': 0.0, 'stock_st': 0.0, 'stock_lt': 0.0, 'stock_count': 0,
                'options_total': 0.0, 'options_st': 0.0, 'options_lt': 0.0, 'options_count': 0,
                'options_ticker_count': 0,
            },
        }
        active_plaid_items = [pi for pi in plaid_items if pi.access_token]
        if not active_plaid_items:
             logging.warning(f"No active plaid items for user {request.uid}")
             return jsonify({'error': "Accounts require re-connection."}), 400

        with ThreadPoolExecutor(max_workers=min(len(active_plaid_items), 10)) as executor:
            future_to_pi = {executor.submit(plaid_service.sync_plaid_data, pi.access_token, request.uid, custom_rules, pi.institution_name): pi for pi in active_plaid_items}
            
            for future in future_to_pi:
                pi = future_to_pi[future]
                try:
                    res = future.result()
                    new_assets, new_ra, new_transactions, new_debts, new_paystubs, new_incomes, synced_account_ids, inv_history, inv_txns, inv_sec_map = res
                    all_inv_txns.extend(inv_txns or [])
                    if inv_sec_map:
                        combined_inv_sec_map.update(inv_sec_map)
                    all_new_assets.extend(new_assets)
                    all_new_ra.extend(new_ra)
                    all_new_transactions.extend(new_transactions)
                    all_new_debts.extend(new_debts)
                    all_new_paystubs.extend(new_paystubs)
                    all_new_incomes.extend(new_incomes)
                    synced_ids_total.extend(synced_account_ids)
                    # Aggregate investment history across all linked institutions
                    combined_investment_history['transaction_count'] += inv_history.get('transaction_count', 0)
                    combined_investment_history['total_fees'] += inv_history.get('total_fees', 0)
                    combined_investment_history['current_value'] += inv_history.get('current_value', 0)
                    combined_investment_history['total_cost_basis'] += inv_history.get('total_cost_basis', 0)
                    # Merge earliest date
                    if inv_history.get('earliest_date'):
                        cur = combined_investment_history.get('earliest_date')
                        combined_investment_history['earliest_date'] = inv_history['earliest_date'] if not cur else min(cur, inv_history['earliest_date'])
                    # Merge period totals
                    for pk in PERIOD_KEYS:
                        src = inv_history.get('periods', {}).get(pk, {})
                        for k in ('invested', 'proceeds', 'dividends'):
                            combined_investment_history['periods'][pk][k] += src.get(k, 0)
                    # Merge per-account breakdown (unique account IDs per institution)
                    if inv_history.get('by_account'):
                        combined_investment_history['by_account'].update(inv_history['by_account'])
                    # Take first non-empty benchmarks (same market data for all institutions)
                    if not combined_investment_history['benchmarks'] and inv_history.get('benchmarks'):
                        combined_investment_history['benchmarks'] = inv_history['benchmarks']
                    # Merge period_returns using value-weighted average across institutions.
                    # Each institution's period return is weighted by its current market value.
                    inst_pr = inv_history.get('period_returns', {}) or {}
                    inst_mv = inv_history.get('current_value', 0) or 0
                    if inst_pr and inst_mv > 0:
                        for _pk, _ret in inst_pr.items():
                            if _ret is None:
                                continue
                            accum = combined_investment_history['_pr_accum'].setdefault(_pk, {'sum': 0.0, 'wt': 0.0})
                            accum['sum'] += _ret * inst_mv
                            accum['wt'] += inst_mv
                    # Merge realized gains across institutions (additive — they don't overlap)
                    inst_rg = inv_history.get('realized_gains') or {}
                    if inst_rg:
                        crg = combined_investment_history['realized_gains']
                        crg['total_realized'] += inst_rg.get('total_realized', 0)
                        crg['total_st'] += inst_rg.get('total_st', 0)
                        crg['total_lt'] += inst_rg.get('total_lt', 0)
                        crg['unmatched_proceeds'] += inst_rg.get('unmatched_proceeds', 0)
                        crg['unmatched_count'] += inst_rg.get('unmatched_count', 0)
                        crg['sell_count'] += inst_rg.get('sell_count', 0)
                        for _sk in ('stock_total', 'stock_st', 'stock_lt', 'stock_count',
                                    'options_total', 'options_st', 'options_lt', 'options_count',
                                    'options_ticker_count'):
                            crg[_sk] = (crg.get(_sk, 0) or 0) + (inst_rg.get(_sk, 0) or 0)
                        # Merge per-calendar-year aggregates (additive)
                        if 'by_year' not in crg:
                            crg['by_year'] = {}
                        for _yr, _ydata in (inst_rg.get('by_year') or {}).items():
                            cy = crg['by_year'].setdefault(_yr, {'total': 0.0, 'st': 0.0, 'lt': 0.0, 'count': 0})
                            for _yk in ('total', 'st', 'lt', 'count'):
                                cy[_yk] += _ydata.get(_yk, 0)
                        # Earliest date across institutions
                        inst_earliest = inst_rg.get('earliest_txn_date')
                        if inst_earliest and (not crg['earliest_txn_date'] or inst_earliest < crg['earliest_txn_date']):
                            crg['earliest_txn_date'] = inst_earliest
                        # Period totals additive
                        for _pk, _pdata in (inst_rg.get('periods') or {}).items():
                            cp = crg['periods'].setdefault(_pk, {'total': 0.0, 'st': 0.0, 'lt': 0.0, 'count': 0})
                            for _k in ('total', 'st', 'lt', 'count'):
                                cp[_k] += _pdata.get(_k, 0)
                        # Per-ticker: merge by ticker. If same ticker held at two institutions,
                        # gains aggregate. Sells lists concatenate (then sorted/truncated below).
                        for _tk, _tdata in (inst_rg.get('by_ticker') or {}).items():
                            ct = crg['by_ticker'].setdefault(_tk, {
                                'total': 0.0, 'st': 0.0, 'lt': 0.0, 'count': 0, 'sells': [],
                                'is_option': False, 'underlying': None,
                            })
                            ct['total'] += _tdata.get('total', 0)
                            ct['st'] += _tdata.get('st', 0)
                            ct['lt'] += _tdata.get('lt', 0)
                            ct['count'] += _tdata.get('count', 0)
                            ct['sells'].extend(_tdata.get('sells', []))
                            # Propagate ticker-intrinsic flags (these are determined by the
                            # ticker symbol itself, not aggregated). Always overwrite to ensure
                            # they propagate even if the ticker dict was created via setdefault.
                            ct['is_option'] = _tdata.get('is_option', False)
                            ct['underlying'] = _tdata.get('underlying')
                    pi.last_sync = datetime.now().isoformat()
                    logging.info(f"Successfully synced institution {pi.institution_name}")
                except Exception as e:
                    logging.error(f"Failed to sync institution {pi.institution_name}: {e}")

        # Finalize value-weighted period returns across all institutions
        _accum = combined_investment_history.pop('_pr_accum', {})
        for _pk, _a in _accum.items():
            if _a['wt'] > 0:
                combined_investment_history['period_returns'][_pk] = round(_a['sum'] / _a['wt'], 2)

        # Round + trim merged realized gains
        _crg = combined_investment_history.get('realized_gains') or {}
        if _crg:
            for _k in ('total_realized', 'total_st', 'total_lt', 'unmatched_proceeds',
                       'stock_total', 'stock_st', 'stock_lt',
                       'options_total', 'options_st', 'options_lt'):
                _crg[_k] = round(_crg.get(_k, 0), 2)
            for _pk, _pd in _crg.get('periods', {}).items():
                for _kk in ('total', 'st', 'lt'):
                    _pd[_kk] = round(_pd.get(_kk, 0), 2)
            for _yr, _yd in _crg.get('by_year', {}).items():
                for _kk in ('total', 'st', 'lt'):
                    _yd[_kk] = round(_yd.get(_kk, 0), 2)
            # Trim and round per-ticker
            for _tk, _td in _crg.get('by_ticker', {}).items():
                for _kk in ('total', 'st', 'lt'):
                    _td[_kk] = round(_td.get(_kk, 0), 2)
                _td['sells'].sort(key=lambda s: s.get('date', ''), reverse=True)
                _td['sells'] = _td['sells'][:50]

        # ── Snapshot-based period return fallback ─────────────────────────────
        # The ticker-based fallback fails when holdings are mutual funds / ETFs
        # that yfinance can't price. Portfolio snapshots are written on every sync
        # and give us actual historical portfolio values — 100% reliable.
        # Only runs for periods still missing after the ticker fallback.
        try:
            _all_periods = ('1w', '1m', 'ytd', '1y', '2y', '5y')
            _missing = [p for p in _all_periods if p not in combined_investment_history['period_returns']]
            _cur_val = combined_investment_history.get('current_value', 0)
            if _missing and _cur_val > 100:
                from datetime import timedelta
                _today = datetime.now().date()
                _period_targets = {
                    '1w':  _today - timedelta(days=7),
                    '1m':  _today - timedelta(days=30),
                    'ytd': _today.replace(month=1, day=1),
                    '1y':  _today - timedelta(days=365),
                    '2y':  _today - timedelta(days=730),
                    '5y':  _today - timedelta(days=1825),
                }
                _snap_docs = get_db().collection('users').document(request.uid) \
                    .collection('portfolio_snapshots') \
                    .order_by('date') \
                    .limit(2000).get()
                # Build sorted list of (date_str, value) — exclude today so we get historical values
                _today_str = _today.strftime('%Y-%m-%d')
                # d is a DocumentSnapshot — .get() takes no default, so convert to dict
                # first (the same bug that silently emptied /api/portfolio_history).
                _snap_rows = []
                for d in _snap_docs:
                    _sd = d.to_dict() or {}
                    _dt = _sd.get('date'); _tv = _sd.get('total_value', 0)
                    if _dt and _tv and _tv > 0 and _dt < _today_str:
                        _snap_rows.append((_dt, _tv))
                _snaps = sorted(_snap_rows, key=lambda x: x[0])
                if _snaps:
                    _snap_date_strs = [s[0] for s in _snaps]
                    _snap_val_map = {s[0]: s[1] for s in _snaps}
                    for _pk in _missing:
                        _target = _period_targets[_pk].strftime('%Y-%m-%d')
                        # Nearest snapshot on or before the target date
                        _candidates = [d for d in _snap_date_strs if d <= _target]
                        if not _candidates:
                            continue
                        _start_val = _snap_val_map[max(_candidates)]
                        if _start_val > 0:
                            # Modified Dietz: adjust for cash flows during the period to avoid
                            # treating deposits as performance.
                            _pdata = (combined_investment_history.get('periods') or {}).get(_pk, {})
                            _net_flow = (_pdata.get('invested', 0) or 0) - (_pdata.get('proceeds', 0) or 0) - (_pdata.get('dividends', 0) or 0)
                            _denom = _start_val + 0.5 * _net_flow
                            if _denom > 100:
                                _pct = (_cur_val - _start_val - _net_flow) / _denom * 100
                                combined_investment_history['period_returns'][_pk] = round(_pct, 2)
                                logging.info(f"[Sync {request.uid}] Snapshot period return {_pk}: {_pct:.2f}% (start=${_start_val:.0f}, flow=${_net_flow:.0f})")
        except Exception as _sp_e:
            logging.warning(f"Snapshot period return fallback failed: {_sp_e}")

        # REPLACEMENT LOGIC: Purge existing assets that belong to the institutions we successfully synced, 
        # but are not present in the fresh sync payload (e.g., sold assets, closed accounts, or stale sandbox data).
        synced_inst_names = {pi.institution_name for pi in active_plaid_items if pi.institution_name}
        
        def is_ghost_asset(asset):
            if not asset.plaid_account_id: return False
            # If the institution for this asset was just successfully synced, 
            # and this specific asset's ID WAS NOT in the new list, it is a ghost.
            if asset.institution_name in synced_inst_names:
                # Use substring check for the account_id part within the plaid_account_id
                return not any(sid in asset.plaid_account_id for sid in synced_ids_total)
            return False

        assets = [a for a in assets if not is_ghost_asset(a)]
        debts = [d for d in debts if not is_ghost_asset(d)]
        
        # Add any newly discovered retirement accounts (matching by ID)
        existing_ra_ids = {ra.id for ra in retirement_accounts}
        for nra in all_new_ra:
            if nra.id not in existing_ra_ids: 
                retirement_accounts.append(nra)
                existing_ra_ids.add(nra.id)
        
        # ASSET MERGE: Replace Plaid-synced assets with fresh data; preserve manual assets.
        # NOTE: Old approach (assets + all_new_assets merged by ticker key) caused doubling
        # because the same Plaid-synced asset (already in Firestore) got its shares added
        # to the fresh Plaid value on every sync.

        # Step 1: Keep only manual assets (no plaid_account_id) from Firestore
        manual_assets = [a for a in assets if not a.plaid_account_id]

        # Step 2: Merge fresh Plaid assets by (ticker, retirement_account_id, tax_treatment)
        # This correctly combines same holdings across multiple brokerage accounts
        merged_plaid = {}
        for a in all_new_assets:
            key = (a.ticker, a.retirement_account_id, a.tax_treatment.name)
            if key not in merged_plaid:
                merged_plaid[key] = a
            else:
                existing = merged_plaid[key]
                old_total_cost = existing.shares * existing.cost_basis
                new_total_cost = a.shares * a.cost_basis
                total_shares = existing.shares + a.shares
                if total_shares > 0:
                    existing.cost_basis = (old_total_cost + new_total_cost) / total_shares
                existing.shares = total_shares
                if a.total_gain is not None:
                    existing.total_gain = (existing.total_gain or 0) + a.total_gain
                if a.institution_name and existing.institution_name != a.institution_name:
                    if existing.institution_name != 'Multiple Accounts':
                        existing.institution_name = 'Multiple Accounts'

        # Step 3: Add manual assets only when they don't conflict with fresh Plaid data
        # (Plaid wins on ticker collision — avoids double-counting the same account)
        plaid_keys = set(merged_plaid.keys())
        for ma in manual_assets:
            ma_key = (ma.ticker, ma.retirement_account_id, ma.tax_treatment.name)
            if ma_key not in plaid_keys:
                merged_plaid[ma_key] = ma

        assets = list(merged_plaid.values())

        # ── Historical snapshot backfill (COMBINED holdings, run ONCE) ──────────
        # Reconstruct daily portfolio value from the full cross-institution holdings
        # × historical prices, using the combined transaction ledger. Runs here (not
        # per-item) so multi-brokerage users aren't under-counted. Version/staleness-
        # guarded inside, so normal syncs skip it cheaply; best-effort — never breaks sync.
        try:
            from backfill_service import backfill_snapshots
            backfill_snapshots(request.uid, assets, all_inv_txns, combined_inv_sec_map)
        except Exception as _bf_e:
            logging.warning(f"Snapshot backfill failed for {request.uid}: {_bf_e}")

        # DEBTS: Preserve manual interest rates and manual NAME overrides
        existing_plaid_debts = {d.plaid_account_id: d for d in debts if d.plaid_account_id}
        for nd in all_new_debts:
            if nd.plaid_account_id in existing_plaid_debts:
                prev_debt = existing_plaid_debts[nd.plaid_account_id]
                # Preserve manual interest rate
                if nd.interest_rate == 0.0 and prev_debt.interest_rate > 0.0:
                    logging.info(f"Preserving manual interest rate for debt: {nd.name}")
                    nd.interest_rate = prev_debt.interest_rate
                
                # Preserve manual NAME override
                # If the previous name is NOT the same as the fresh sync name,
                # we only preserve it if the old name DOESN'T look like a generated one.
                if prev_debt.name != nd.name:
                    # Treat generic or reward-heavy names as generated
                    generic_names = ['credit card', 'chase credit card', 'chase']
                    is_old_name_generated = (
                        any(kw in prev_debt.name.lower() for kw in ['rewards', 'points', 'cash back']) or 
                        re.search(r'-\d{4}', prev_debt.name) or
                        prev_debt.name.lower() in generic_names
                    )
                    if not is_old_name_generated:
                        logging.info(f"Preserving manual name override: {prev_debt.name} (synced as: {nd.name})")
                        nd.name = prev_debt.name
                    else:
                        logging.info(f"Overwriting generated/generic name '{prev_debt.name}' with specific synced name '{nd.name}'")
        
        # Keep only manual/offline debts
        debts = [d for d in debts if not d.plaid_account_id]
        debts.extend(all_new_debts)
        
        # ROBUST TRANSACTION DEDUPLICATION & REPLACEMENT
        # 1. Identify transactions to be replaced (pending -> cleared)
        sync_txn_ids_to_replace = {getattr(nt, 'pending_transaction_id') for nt in all_new_transactions if getattr(nt, 'pending_transaction_id', None)}
        
        # 2. PURGE: Remove existing transactions for the accounts we just synced that fall within the sync window (last 30 days)
        # This prevents "Sync Accumulation" where old sync results persist alongside new ones.
        sync_window_start = (datetime.now() - timedelta(days=32)).strftime("%Y-%m-%d") # 32 days for safety buffer
        
        transactions = [t for t in transactions if (
            t.account_id not in synced_ids_total or 
            t.date < sync_window_start or
            t.id in sync_txn_ids_to_replace # We'll handle replacement below
        )]
        
        # 3. Add existing transactions (excluding the ones about to be replaced)
        new_transaction_list = []
        for t in transactions:
            if t.id not in sync_txn_ids_to_replace:
                new_transaction_list.append(t)
        
        # 4. Add new transactions (ID-based dedupe)
        existing_ids = {t.id for t in new_transaction_list}
        for nt in all_new_transactions:
            if nt.id not in existing_ids:
                new_transaction_list.append(nt)
                existing_ids.add(nt.id)
        
        # 5. GLOBAL CONTENT-BASED DEDUPE (Final Safety Net)
        # Some banks report the *exact same* transaction with different IDs or across accounts.
        # We find duplicates by (date, amount, normalized_merchant_name).
        unique_txns = []
        seen_content = set()
        # Sort by date descending
        new_transaction_list.sort(key=lambda x: x.date, reverse=True)
        for t in new_transaction_list:
            # Fingerprint: (date, amount, normalized_name)
            # Use the helper from plaid_service to strip branch/location noise
            norm_name = plaid_service.normalize_merchant_name(t.name)
            fingerprint = (t.date, round(float(t.amount), 2), norm_name)
            
            if fingerprint not in seen_content:
                unique_txns.append(t)
                seen_content.add(fingerprint)
            else:
                logging.info(f"Dropped content duplicate (fuzzy): {t.name} -> {norm_name} | {t.date} | ${t.amount}")
        
        # PERSISTENT CLEANUP
        # We wipe the subcollections before saving to ensure dropped duplicates are removed.
        wipe_user_subcollections(request.uid)
        
        transactions = unique_txns
        transactions.sort(key=lambda x: x.date, reverse=True)

        existing_paystub_ids = {p.id for p in paystubs}
        _excluded_paystub_ids = set(getattr(user, 'excluded_paystub_ids', []))
        _excluded_paystub_employers = {e.lower().strip() for e in getattr(user, 'excluded_paystub_employers', [])}
        # Secondary dedup fingerprint: (employer_lower, year-month, gross_amount)
        existing_paystub_fingerprints = {
            (
                (p.employer or '').lower().strip(),
                str(p.date)[:7],
                round(float(p.gross_amount or 0), 2)
            )
            for p in paystubs
        }
        for np in all_new_paystubs:
            np_employer = (np.employer or '').lower().strip()
            if np.id in _excluded_paystub_ids:
                logging.info(f"Skipping excluded paystub by ID: {np.id} ({np.employer})")
                continue
            if np_employer and np_employer in _excluded_paystub_employers:
                logging.info(f"Skipping excluded paystub by employer: {np.employer}")
                continue
            np_fingerprint = (np_employer, str(np.date)[:7], round(float(np.gross_amount or 0), 2))
            if np_fingerprint in existing_paystub_fingerprints:
                continue
            if np.id not in existing_paystub_ids:
                paystubs.append(np)

        # INVESTMENT INCOME MERGE & DEDUPE
        existing_income_fingerprints = {
            (getattr(i, 'date', ''), i.income_type.name, round(float(i.amount), 2), (i.description or '').lower().strip())
            for i in incomes
        }
        
        for ni in all_new_incomes:
            # Note: Income model from sync doesn't have an ID yet, it's just a dataclass
            # Fingerprint: (year, type, amount, description)
            # Since sync'd incomes have 'year' but not 'date' in the Income model, 
            # and we want to be year-aware.
            safe_amt = round(float(ni.amount if ni.amount is not None else 0), 2)
            safe_desc = str(ni.description or '').lower().strip()
            fingerprint = (getattr(ni, 'year', 2026), ni.income_type.name, safe_amt, safe_desc)
            
            # Check against existing (some might have date, some just year)
            # Let's simplify: if same year, type, amount, and description -> likely same.
            is_duplicate = False
            for ei in incomes:
                ei_safe_amt = round(float(ei.amount if ei.amount is not None else 0), 2)
                ei_safe_desc = str(ei.description or '').lower().strip()
                ei_fingerprint = (getattr(ei, 'year', 2026), ei.income_type.name, ei_safe_amt, ei_safe_desc)
                if fingerprint == ei_fingerprint:
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                logging.info(f"Adding new SYNCED INCOME: {ni.description} | ${ni.amount}")
                incomes.append(ni)

        # OUTSTANDING CHECK RECONCILIATION
        from models import CheckStatus
        for nt in all_new_transactions:
            if nt.amount > 0 and nt.id not in existing_ids:
                for chk in outstanding_checks:
                    if chk.status == CheckStatus.PENDING and abs(chk.amount - nt.amount) < 0.01:
                        try:
                            chk_date = datetime.strptime(chk.date_written, "%Y-%m-%d")
                            tx_date = datetime.strptime(nt.date, "%Y-%m-%d")
                            if 0 <= (tx_date - chk_date).days <= 30:
                                chk.status = CheckStatus.CLEARED
                                chk.plaid_transaction_id = nt.id
                                break
                        except ValueError: pass

        # RE-EVALUATE EXISTING TRANSACTIONS
        # ARCH-5: Persistence - only overwrite category if a valid CUSTOM RULE exists.
        # This prevents manual overrides from being reset to defaults (e.g. Safeway -> Transportation).
        for t in transactions:
            # 1. Check if there's a custom rule first
            rule_cat = None
            if custom_rules:
                for rule in custom_rules:
                    if rule.merchant_name.lower() in t.name.lower() or t.name.lower() in rule.merchant_name.lower():
                        rule_cat = rule.category
                        break
            
            if rule_cat:
                if t.category != rule_cat:
                    t.category = rule_cat
            elif not t.category or t.category in ['Other', 'Uncategorized']:
                # Only guess if it's currently uncategorized
                new_cat = plaid_service.categorize_transaction(t.name, None, custom_rules)
                if new_cat and t.category != new_cat:
                    t.category = new_cat

        # Final save
        save_user_data(
            user, incomes, assets, debts, retirement_accounts, insurances,
            plaid_items=plaid_items, budgets=budgets, transactions=transactions,
            paystubs=paystubs, custom_rules=custom_rules,
            has_completed_onboarding=has_completed_onboarding,
            custom_categories=custom_categories,
            outstanding_checks=outstanding_checks,
            ignored_flexible=ignored_flexible, # Persist ignore list
            user_id=request.uid
        )

        # Persist investment_history so it's available on next page load (not just this sync session)
        if combined_investment_history.get('transaction_count', 0) > 0:
            try:
                _db = get_db()
                if _db:
                    _db.collection('users').document(request.uid).set(
                        {'investment_history': combined_investment_history}, merge=True
                    )
            except Exception as _e:
                logging.warning(f"Failed to persist investment_history: {_e}")

        # Take a daily portfolio snapshot for future MWR calculations
        take_portfolio_snapshot(request.uid, assets)

        price_map = get_multiple_prices([a.ticker for a in assets])

        net_worth_data = calculate_net_worth(user, incomes, assets, debts, retirement_accounts, insurances, paystubs)
        net_worth_data['assets'] = [asset_to_dict(a, price_map) for a in assets]
        net_worth_data['incomes'] = [income_to_dict(i) for i in incomes]
        net_worth_data['debts'] = [debt_to_dict(d) for d in debts]
        net_worth_data['retirement_accounts'] = [retirement_account_to_dict(ra) for ra in retirement_accounts]
        net_worth_data['insurances'] = [get_insurance_to_dict(ins) for ins in insurances]
        net_worth_data['plaid_items'] = [{'institution_name': pi.institution_name, 'last_sync': pi.last_sync} for pi in plaid_items]
        net_worth_data['budgets'] = [budget_to_dict(b) for b in budgets]
        net_worth_data['transactions'] = [transaction_to_dict(t) for t in transactions]
        net_worth_data['paystubs'] = [paystub_to_dict(p) for p in paystubs]
        net_worth_data['outstanding_checks'] = [{'id': c.id, 'amount': c.amount, 'payee': c.payee, 'date_written': c.date_written, 'status': c.status.name, 'plaid_transaction_id': c.plaid_transaction_id} for c in outstanding_checks]
        _is_authorized = is_user_authorized(request.uid, getattr(request, 'email', None))
        _is_subscribed = getattr(user, 'is_subscribed', False)
        _is_premium = _is_subscribed or _is_authorized
        net_worth_data['is_authorized'] = _is_premium
        net_worth_data['is_subscribed'] = _is_premium
        net_worth_data['investment_history'] = combined_investment_history
        return jsonify(net_worth_data)
    except Exception as e:
        import traceback
        logging.error(f"Sync error: {str(e)}")
        logging.error(traceback.format_exc())
        return jsonify({'error': 'Synchronization error'}), 500

@app.route('/api/user/onboarding_complete', methods=['PUT'])
@token_required
def onboarding_complete():
    uid = "demo_user" if request.uid == "guest" else request.uid
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, _, custom_categories, outstanding_checks, ignored_flexible = get_user_data(user_id=uid)
    save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=True, custom_categories=custom_categories, outstanding_checks=outstanding_checks, ignored_flexible=ignored_flexible, user_id=uid)
    return jsonify({'success': True})

@app.route('/api/user_tax_info', methods=['PUT'])
@token_required
def update_user_tax_info():
    data = request.get_json()
    uid = "demo_user" if request.uid == "guest" else request.uid
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories, outstanding_checks, ignored_flexible = get_user_data(user_id=uid)
    
    if data.get('filing_status'): user.filing_status = safe_enum(FilingStatus, data['filing_status'], FilingStatus.SINGLE)
    if data.get('state'): user.state = safe_enum(USState, data['state'], USState.CA)
    if data.get('employment_type'): user.employment_type = safe_enum(EmploymentType, data['employment_type'], EmploymentType.W2)
    if 'business_deductions' in data: user.business_deductions = float(data['business_deductions'])
    if 'dependents' in data: user.dependents = int(data['dependents'])
    
    save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, outstanding_checks=outstanding_checks, user_id=uid)
    return jsonify({'success': True})

@app.route('/api/user/subscription_preferences', methods=['POST'])
@token_required
def update_subscription_preferences():
    try:
        data = request.get_json()
        uid = "demo_user" if request.uid == "guest" else request.uid
        
        user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories, outstanding_checks, ignored_flexible = get_user_data(user_id=uid)
        
        if 'ignored_subscription_merchants' in data:
            user.ignored_subscription_merchants = data['ignored_subscription_merchants']
        if 'manual_subscription_merchants' in data:
            user.manual_subscription_merchants = data['manual_subscription_merchants']
            
        save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, outstanding_checks=outstanding_checks, user_id=uid)
        return jsonify({
            'success': True, 
            'ignored_subscription_merchants': getattr(user, 'ignored_subscription_merchants', []), 
            'manual_subscription_merchants': getattr(user, 'manual_subscription_merchants', [])
        })
    except Exception as e:
        logging.error(f"Error in subscription_preferences: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/create_link_token', methods=['POST'])
@auth_required
def create_link_token():
    if not is_user_authorized(request.uid, getattr(request, 'email', None)):
        return jsonify({'error': "Access restricted."}), 403
    try:
        link_token = plaid_service.create_link_token(request.uid)
        return jsonify({'link_token': link_token})
    except Exception as e:
        return jsonify({'error': "Failed to create link token."}), 500

@app.route('/api/create_update_token', methods=['POST'])
@auth_required
def create_update_token():
    if not is_user_authorized(request.uid, getattr(request, 'email', None)):
        return jsonify({'error': "Access restricted."}), 403
    
    data = request.get_json()
    institution_name = data.get('institution_name')
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories, outstanding_checks, ignored_flexible = get_user_data(user_id=request.uid)
    
    target_item = next((item for item in plaid_items if item.institution_name == institution_name), None)
    if not target_item:
        return jsonify({'error': "Institution not found"}), 404
        
    try:
        link_token = plaid_service.create_update_token(request.uid, target_item.access_token)
        return jsonify({'link_token': link_token})
    except Exception as e:
        return jsonify({'error': "Failed to create update token."}), 500

@app.route('/api/set_access_token', methods=['POST'])
@auth_required
def set_access_token():
    if not is_user_authorized(request.uid, getattr(request, 'email', None)):
        return jsonify({'error': "Access restricted."}), 403
    data = request.get_json()
    public_token = data.get('public_token')
    institution_name = data.get('metadata', {}).get('institution', {}).get('name', 'Bank')
    if not public_token: return jsonify({'error': "Missing public token"}), 400
    try:
        exchange_response = plaid_service.exchange_public_token(public_token)
        access_token, item_id = exchange_response['access_token'], exchange_response['item_id']
        user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories, outstanding_checks, ignored_flexible = get_user_data(user_id=request.uid)
        
        plaid_items = [pi for pi in plaid_items if pi.institution_name != institution_name]
        plaid_items.append(PlaidItem(access_token=access_token, item_id=item_id, institution_name=institution_name, last_sync=datetime.now().isoformat()))
        
        save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, outstanding_checks=outstanding_checks, ignored_flexible=ignored_flexible, user_id=request.uid)
        
        price_map = get_multiple_prices([a.ticker for a in assets])
        
        net_worth_data = calculate_net_worth(user, incomes, assets, debts, retirement_accounts, insurances, paystubs)
        net_worth_data['assets'] = [asset_to_dict(a, price_map) for a in assets]
        net_worth_data['incomes'] = [income_to_dict(i) for i in incomes]
        net_worth_data['debts'] = [debt_to_dict(d) for d in debts]
        net_worth_data['retirement_accounts'] = [retirement_account_to_dict(ra) for ra in retirement_accounts]
        net_worth_data['insurances'] = [get_insurance_to_dict(ins) for ins in insurances]
        net_worth_data['plaid_items'] = [{'institution_name': pi.institution_name, 'last_sync': pi.last_sync} for pi in plaid_items]
        net_worth_data['budgets'] = [budget_to_dict(b) for b in budgets]
        net_worth_data['transactions'] = [transaction_to_dict(t) for t in transactions]
        net_worth_data['paystubs'] = [paystub_to_dict(p) for p in paystubs]
        net_worth_data['filing_status'] = user.filing_status.name
        net_worth_data['state'] = user.state.name
        net_worth_data['employment_type'] = getattr(user, 'employment_type', EmploymentType.W2).name
        net_worth_data['business_deductions'] = getattr(user, 'business_deductions', 0.0)
        net_worth_data['dependents'] = getattr(user, 'dependents', 0)
        net_worth_data['outstanding_checks'] = [{'id': c.id, 'amount': c.amount, 'payee': c.payee, 'date_written': c.date_written, 'status': c.status.name, 'plaid_transaction_id': c.plaid_transaction_id} for c in outstanding_checks]
        _is_authorized = is_user_authorized(request.uid, getattr(request, 'email', None))
        _is_subscribed = getattr(user, 'is_subscribed', False)
        _is_premium = _is_subscribed or _is_authorized
        net_worth_data['is_authorized'] = _is_premium
        net_worth_data['is_subscribed'] = _is_premium
        return jsonify(net_worth_data)
    except Exception as e:
        return jsonify({'error': "Failed to exchange access token."}), 500

def get_contextual_memory(user_id):
    """Fetches all stored facts for a user and formats them into a concise string."""
    memories = firestore_db.get_user_memories(user_id)
    if not memories:
        return "No previous habits, goals, or constraints recorded yet."
    
    formatted_facts = []
    for m in memories:
        category = m.get('category', 'Fact')
        content = m.get('content', '')
        formatted_facts.append(f"[{category}] {content}")
        
    return "; ".join(formatted_facts)

@app.route('/api/ask_advisor', methods=['POST'])
@auth_required
def ask_advisor():
    if not is_user_authorized(request.uid, getattr(request, 'email', None)):
        return jsonify({'error': "Access restricted to Premium accounts."}), 403
        
    # ARCH-4: Strict Rate limit for AI Advisor (20 calls / hour) + per-IP backstop
    if not check_rate_limit(request.uid, 'ask_advisor', limit_per_hour=20, fail_closed=True):
        return jsonify({'error': "AI Advisor limit reached. Please try again in an hour."}), 429
    if not check_ip_rate_limit('ask_advisor', limit_per_hour=50):
        return jsonify({'error': "Too many requests from your network. Please try again in an hour."}), 429

    data = request.get_json()
    user_prompt = data.get('prompt')
    if not user_prompt: return jsonify({'error': "Missing prompt"}), 400
    if len(user_prompt) > 2000:
        return jsonify({'error': "Prompt too long."}), 400
        
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories, outstanding_checks, ignored_flexible = get_user_data(user_id=request.uid)
    
    # 1. Fetch persistent semantic memory
    memory_string = get_contextual_memory(request.uid)
    
    # 2. Prepare financial data and PoP comparison
    price_map = get_multiple_prices([a.ticker for a in assets])
    financial_data = calculate_net_worth(user, incomes, assets, debts, retirement_accounts, insurances, paystubs)
    financial_data['assets'] = [asset_to_dict(a, price_map) for a in assets]
    financial_data['debts'] = [debt_to_dict(d) for d in debts]
    financial_data['transactions'] = [transaction_to_dict(t) for t in transactions]
    financial_data['budgets'] = [budget_to_dict(b) for b in budgets]
    financial_data['insurances'] = [get_insurance_to_dict(ins) for ins in insurances]
    financial_data['state'] = user.state.name
    financial_data['contextual_memory'] = memory_string  # Persistent memory

    # 3. Reflection middleware (Background task — fire-and-forget)
    # BUGFIX: capture uid in the request thread. `request` is context-local and
    # is NOT available inside the spawned daemon thread — accessing request.uid
    # there raised "working outside of request context" and silently dropped
    # every memory write. Bind it to a local before the thread starts.
    _reflect_uid = request.uid
    def reflect_and_save():
        import advisor_service as _adv
        new_fact = _adv.extract_user_memory(user_prompt, memory_string)
        if new_fact:
            firestore_db.save_user_memory(
                user_id=_reflect_uid,
                fact_id=new_fact.get('fact_id'),
                category=new_fact.get('category'),
                content=new_fact.get('content')
            )

    import threading
    from flask import Response, stream_with_context
    threading.Thread(target=reflect_and_save, daemon=True).start()

    # 4. Stream the advice as SSE
    def generate():
        try:
            for chunk in advisor_service.get_financial_advice_stream(user_prompt, financial_data):
                yield chunk
        except Exception as e:
            import json as _j
            yield f'data: {_j.dumps({"error": str(e)})}\n\n'
            yield 'data: [DONE]\n\n'

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',  # Disable nginx buffering
            'Connection': 'keep-alive',
        }
    )

@app.route('/api/health_brief', methods=['GET'])
@auth_required
def get_health_brief():
    # SEC: this fires a Claude call (generate_health_brief) but previously had NO
    # rate limit — any logged-in account could spam it. 40/hr is generous for
    # legitimate dashboard use (a few section fetches per load) while capping abuse.
    if not check_rate_limit(request.uid, 'health_brief', limit_per_hour=40, fail_closed=True):
        return jsonify({'error': "Brief limit reached. Please try again in a bit."}), 429
    if not check_ip_rate_limit('health_brief', limit_per_hour=100):
        return jsonify({'error': "Too many requests from your network. Please try again in a bit."}), 429
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories, outstanding_checks, ignored_flexible = get_user_data(user_id=request.uid)
    
    memory_string = get_contextual_memory(request.uid)
    
    try:
        from tax_logic import calculate_taxes
        tax_results = calculate_taxes(user.state.name, incomes)
    except Exception:
        tax_results = {}
        
    # Use the full calculate_net_worth() so the brief reflects real market prices,
    # not just cost-basis estimates.
    from calculations import calculate_net_worth
    nw_result = calculate_net_worth(user, incomes, assets, debts, retirement_accounts, insurances, paystubs)

    financial_data = {
        'real_time_net_worth': nw_result.get('real_time_net_worth', 0),
        'contextual_memory': memory_string,
        'outstanding_checks': [{'amount': c.amount, 'payee': c.payee} for c in outstanding_checks if c.status.name == 'PENDING'],
        'tax_projections': tax_results,
        'transactions': [{'amount': t.amount, 'category': t.category, 'pending': t.pending} for t in transactions[:100]],
        'debts': [debt_to_dict(d) for d in debts],
        'insurances': [get_insurance_to_dict(ins) for ins in insurances]
    }
    
    section = request.args.get('section', 'all')

    # Determine brief type from server-side hour
    from datetime import datetime as _dt
    _hour = _dt.now().hour
    if 6 <= _hour < 12:
        brief_type = "morning"
    elif 12 <= _hour < 17:
        brief_type = "afternoon"
    elif 17 <= _hour < 22:
        brief_type = "evening"
    else:
        brief_type = "night"

    try:
        import advisor_service
        brief = advisor_service.generate_health_brief(financial_data, brief_type=brief_type, section=section)
    except Exception as e:
        logging.error(f"Failed to generate brief (section={section}): {e}")
        brief = "**Liquidity Check:** Analysis timed out.\n**Insurance:** Analysis timed out.\n**Goal Progress:** Analysis timed out. Please refresh to retry."

    # When section="all", advisor_service returns a dict with {brief, news, brief_type} already.
    # For specific sections ("overview", "news"), it returns a plain string — wrap it uniformly.
    if isinstance(brief, dict):
        return jsonify(brief)
    return jsonify({'brief': brief, 'brief_type': brief_type})

def process_extracted_transactions(new_transactions, uid):
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories, outstanding_checks, ignored_flexible = get_user_data(user_id=uid)
    
    existing_sigs = {(t.amount, t.name, t.date) for t in transactions}
    added_count = 0
    for nt in new_transactions:
        if (nt.amount, nt.name, nt.date) not in existing_sigs:
            transactions.append(nt)
            added_count += 1
            
    if added_count > 0:
        save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, outstanding_checks=outstanding_checks, user_id=uid)
        
    return jsonify({
        'success': True, 
        'message': f"Successfully imported {added_count} new transactions.",
        'transactions': [transaction_to_dict(t) for t in transactions]
    })

@app.route('/api/upload_statement', methods=['POST'])
@auth_required  # SEC: was @token_required — Claude vision/document; reject guests
def upload_statement():
    uid = request.uid  # auth_required guarantees a real uid (guests rejected with 401)
    if 'file' not in request.files:
        return jsonify({'error': "No file part"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': "No selected file"}), 400
        
    import os
    ext = os.path.splitext(file.filename)[1].lower()
    allowed_exts = {'.csv', '.pdf', '.png', '.jpg', '.jpeg'}

    if ext not in allowed_exts:
        return jsonify({'error': f"Invalid format {ext}. Supported: PDF, Image, CSV."}), 400

    if ext != '.csv':
        file_bytes = file.read()
        if not _validate_file_magic(file_bytes, ext):
            return jsonify({'error': 'File content does not match the declared file type.'}), 400
        file.seek(0)  # reset for subsequent reads

    if ext == '.csv':
        try:
            content = file.read().decode('utf-8')
            new_transactions = statement_processor.detect_and_parse_csv(content, uid)
            if new_transactions:
                return process_extracted_transactions(new_transactions, uid)
            file.seek(0) # Fallback to AI if parsing returns empty
        except Exception as e:
            file.seek(0)
            
    # AI Fallback Path (PDFs, Images, and unrecognized CSVs) — Claude vision/document
    # ARCH-4: Rate Limiting specific to expensive AI features. fail_closed (Claude call).
    _ok, _resp = _require_verified_email()
    if not _ok:
        return _resp
    if not check_rate_limit(request.uid, 'extract_statement', limit_per_hour=10, fail_closed=True):
        return jsonify({'error': "Upload limit reached. Please try again later."}), 429
    if not check_ip_rate_limit('extract_statement', limit_per_hour=30):
        return jsonify({'error': "Too many requests from your network. Please try again later."}), 429

    import base64
    import tempfile
    import json
    import uuid
    from models import Transaction
    from advisor_service import _get_client, _CLAUDE_MODEL

    client, err = _get_client()
    if err:
        return jsonify({'error': "AI extraction is currently disabled (No API Key)."}), 500

    temp_path = None
    text_out = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
            file.save(temp_file.name)
            temp_path = temp_file.name
        with open(temp_path, 'rb') as f:
            file_bytes = f.read()

        b64_data = base64.standard_b64encode(file_bytes).decode('utf-8')
        if ext == '.pdf':
            doc_block = {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64_data}}
        else:
            media_type_map = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}
            doc_block = {"type": "image", "source": {"type": "base64", "media_type": media_type_map.get(ext, 'image/jpeg'), "data": b64_data}}

        system_instruction = (
            "You are an extreme-precision document data extraction pipeline. You must extract every individual "
            "transaction line item from the provided bank or credit card statement. "
            "Return ONLY a valid JSON Array of objects. Each object MUST have these exact 4 keys: "
            "'date' (string, YYYY-MM-DD), 'name' (string, the merchant or description), "
            "'amount' (float, MUST be negative for purchases/withdrawals, and positive for deposits/payments/refunds), "
            "and 'category' (string, best guess or 'Other'). "
            "Do NOT include markdown blocks. Output the raw JSON array only."
        )
        user_prompt = "Extract all transactions from this statement. Output a raw JSON Array, nothing else."

        response = client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=8192,  # statements can have many line items
            system=system_instruction,
            messages=[{"role": "user", "content": [doc_block, {"type": "text", "text": user_prompt}]}],
        )

        for block in response.content:
            if getattr(block, 'type', None) == 'text':
                text_out += block.text

        cleaned = text_out.strip()
        if cleaned.startswith('```'):
            cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
            cleaned = re.sub(r'\s*```$', '', cleaned)

        parsed_array = json.loads(cleaned)
        
        if not isinstance(parsed_array, list):
            return jsonify({'error': "AI returned an invalid structure. Please try again."}), 500
            
        ai_transactions = []
        for raw in parsed_array:
            if not raw.get('name') or not raw.get('date'): continue
            ai_transactions.append(Transaction(
                id=str(uuid.uuid4()),
                user_id=uid,
                account_id="manual_ai_statement",
                amount=float(raw.get('amount', 0)),
                date=raw.get('date', '2026-01-01')[:10],
                name=raw.get('name', 'Unknown'),
                category=raw.get('category', 'Other'),
                pending=False
            ))
            
        if not ai_transactions:
            return jsonify({'error': "No valid transactions could be extracted."}), 400

        return process_extracted_transactions(ai_transactions, uid)

    except json.JSONDecodeError as je:
        logging.error(f"Statement extraction JSON parse error: {je}. Raw output: {text_out[:500] if text_out else 'unavailable'}")
        return jsonify({'error': 'Could not parse extracted transactions. Try a clearer image or PDF.'}), 500
    except Exception as e:
        import traceback
        logging.error(f"AI Extraction Error: {e} - {traceback.format_exc()}")
        return jsonify({'error': 'Failed to analyze statement'}), 500
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

@app.route('/api/extract-document', methods=['POST'])
@auth_required  # SEC: was @token_required — Claude vision is the priciest call; reject guests
def extract_document():
    # ARCH-4: Rate Limiting specific to expensive AI features. fail_closed so a
    # Firestore outage pauses (not uncaps) the most expensive endpoint we have.
    _ok, _resp = _require_verified_email()
    if not _ok:
        return _resp
    if not check_rate_limit(request.uid, 'extract_doc', limit_per_hour=20, fail_closed=True):
        return jsonify({'error': "Extraction limit reached. Please try again later."}), 429
    if not check_ip_rate_limit('extract_doc', limit_per_hour=50):
        return jsonify({'error': "Too many requests from your network. Please try again later."}), 429
        
    doc_type = request.form.get('doc_type', 'tax')
    
    if 'file' not in request.files:
        return jsonify({'error': "No file part"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': "No selected file"}), 400
        
    import os
    allowed_exts = {'.pdf', '.png', '.jpg', '.jpeg'}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_exts:
        return jsonify({'error': f"Invalid file type. Supported types: {', '.join(allowed_exts)}"}), 400

    file_bytes = file.read()
    if not _validate_file_magic(file_bytes, ext):
        return jsonify({'error': 'File content does not match the declared file type.'}), 400
    file.seek(0)  # reset for subsequent reads

    import json
    import base64
    import tempfile
    from advisor_service import _get_client, _CLAUDE_MODEL

    client, err = _get_client()
    if err:
        return jsonify({'error': "AI client not configured. Cannot process document."}), 500

    # Per-doctype extraction schema
    if doc_type == 'check':
        system_instruction = (
            "You are a precise financial document extraction API. Analyze the provided check image. "
            "Return ONLY a valid JSON object with the following keys: "
            "amount (float, just the numerical value), payee (string, who the check is written to), "
            "and date_written (string, format YYYY-MM-DD). "
            "Do not include any markdown formatting or conversational text. "
            "If a value is missing or illegible, return 0.0 or null."
        )
        user_prompt = "Extract the check data from this image."
    elif doc_type == 'insurance':
        system_instruction = (
            "You are a precise insurance policy auditor. Analyze the provided insurance document. "
            "Extract 'the juice'—the key benefits, liabilities, risks, and summary of the policy. "
            "Return ONLY a valid JSON object with the following keys: "
            "insurance_name (string), insurance_type (string, one of: Auto, Health, Life, Home, Other), "
            "premium_amount (float), frequency (string: MONTHLY, EVERY_6_MONTHS, YEARLY), deductible (float), "
            "coverage_summary (string, max 500 chars summarizes benefits/limits and what is actually covered), "
            "and advisor_observations (string, max 500 chars comparing to standards, spotting gaps, or noting value). "
            "Do not include any markdown formatting or conversational text. "
            "If a value is missing, return 0.0 or null."
        )
        user_prompt = "Audit this insurance policy and provide a rundown."
    else:
        system_instruction = (
            "You are a precise financial document extraction API. Analyze the provided W-2 or paystub. "
            "Return ONLY a valid JSON object with the following keys: "
            "gross_income (float), net_income (float), pay_date (string, YYYY-MM-DD), "
            "federal_taxes_withheld (float), state_taxes_withheld (float), "
            "social_security_withheld (float), medicare_withheld (float), and employer_name (string). "
            "Do not include any markdown formatting or conversational text. "
            "If a value is missing or illegible, return 0.0 or null."
        )
        user_prompt = "Extract the financial data from this document."

    temp_path = None
    try:
        # Save to temp file → read bytes → base64 (Claude vision API takes base64)
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
            file.save(temp_file.name)
            temp_path = temp_file.name
        with open(temp_path, 'rb') as f:
            file_bytes = f.read()

        b64_data = base64.standard_b64encode(file_bytes).decode('utf-8')
        if ext == '.pdf':
            media_type = 'application/pdf'
            doc_block = {
                "type": "document",
                "source": {"type": "base64", "media_type": media_type, "data": b64_data},
            }
        else:
            media_type_map = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}
            media_type = media_type_map.get(ext, 'image/jpeg')
            doc_block = {
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": b64_data},
            }

        # Claude Sonnet 4.6 supports both vision (image) and document (PDF) blocks natively.
        # Ask for JSON output via system instruction; verify and parse defensively below.
        response = client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=1024,
            system=system_instruction,
            messages=[
                {
                    "role": "user",
                    "content": [doc_block, {"type": "text", "text": user_prompt}],
                }
            ],
        )

        # Pull text content; Claude returns content as a list of blocks
        text_out = ""
        for block in response.content:
            if getattr(block, 'type', None) == 'text':
                text_out += block.text

        # Strip markdown code fences defensively (in case Claude wraps the JSON)
        cleaned = text_out.strip()
        if cleaned.startswith('```'):
            # remove leading ```json or ``` and trailing ```
            cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
            cleaned = re.sub(r'\s*```$', '', cleaned)

        result_json = json.loads(cleaned)
        return jsonify({'success': True, 'data': result_json})

    except json.JSONDecodeError as je:
        logging.error(f"Document extraction JSON parse error: {je}. Raw output: {text_out[:500] if 'text_out' in locals() else 'unavailable'}")
        return jsonify({'error': 'Could not parse extracted data. Try a clearer image or PDF.'}), 500
    except Exception as e:
        import traceback
        logging.error(f"Document extraction error: {e} - {traceback.format_exc()}")
        return jsonify({'error': 'Failed to extract document'}), 500
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

@app.route('/api/transactions/<transaction_id>/category', methods=['PUT'])
@auth_required
def update_transaction_category(transaction_id):
    if not is_user_authorized(request.uid, getattr(request, 'email', None)):
        return jsonify({'error': "Access restricted."}), 403

    data = request.get_json()
    new_category = data.get('category')
    create_rule = data.get('create_rule', False)
    merchant_name = data.get('merchant_name')

    if not new_category:
        return jsonify({'error': "Missing category"}), 400

    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories, outstanding_checks, ignored_flexible = get_user_data(user_id=request.uid)

    # 1. Update the specific transaction
    target_txn = next((t for t in transactions if t.id == transaction_id), None)
    if not target_txn:
        return jsonify({'error': "Transaction not found"}), 404
        
    target_txn.category = new_category

    # 2. Add to Custom Rules if requested
    from models import CustomRule
    if create_rule and merchant_name:
        # Check if rule already exists for this merchant and update it, else create new
        existing_rule = next((r for r in custom_rules if r.merchant_name.lower() == merchant_name.lower()), None)
        if existing_rule:
            existing_rule.category = new_category
        else:
            custom_rules.append(CustomRule(merchant_name=merchant_name, category=new_category, user_id=request.uid))
            
        # 3. Retroactively apply this new rule to ALL past transactions with matching merchant name
        for t in transactions:
            if t.name.lower() == merchant_name.lower():
                t.category = new_category

    save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, outstanding_checks=outstanding_checks, ignored_flexible=ignored_flexible, user_id=request.uid)
    return jsonify({'message': "Category updated", 'category': new_category})

@app.route('/api/transactions/<transaction_id>', methods=['DELETE'])
@token_required
def delete_transaction(transaction_id):
    if request.uid == "guest":
        return jsonify({"error": "Unauthorized"}), 401
    try:
        user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories, outstanding_checks, ignored_flexible = get_user_data(user_id=request.uid)

        new_transactions = [t for t in transactions if t.id != transaction_id]

        if len(new_transactions) == len(transactions):
            return jsonify({"error": "Transaction not found"}), 404

        save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=new_transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, outstanding_checks=outstanding_checks, ignored_flexible=ignored_flexible, user_id=request.uid)

        return jsonify({"message": "Transaction deleted successfully"}), 200
    except Exception as e:
        logging.error(f"Error deleting transaction: {e}")
        return jsonify({"error": "Failed to delete transaction"}), 500

@app.route('/api/remove_institution', methods=['POST'])
@auth_required
def remove_institution():
    if not is_user_authorized(request.uid, getattr(request, 'email', None)):
        return jsonify({'error': "Access restricted."}), 403
        
    data = request.get_json()
    institution_name = data.get('institution_name')
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories, outstanding_checks, ignored_flexible = get_user_data(user_id=request.uid)
    
    target_item = next((pi for pi in plaid_items if pi.institution_name == institution_name), None)
    if not target_item:
        return jsonify({'error': "Institution not found"}), 404

    # 1. Identify all account IDs associated with this institution's Plaid Item
    import plaid_service
    removed_account_ids = []
    try:
        # We need to fetch the accounts once to know which IDs to purge from our DB
        accounts_resp = plaid_service.client.accounts_get(plaid_service.AccountsGetRequest(access_token=target_item.access_token)).to_dict()
        removed_account_ids = [acc['account_id'] for acc in accounts_resp['accounts']]
    except Exception as e:
        logging.error(f"Error fetching account IDs for removal: {e}")
        # Fallback: if token is invalid, we might have to rely on institution_name matching
        # Assets and Debts often have institution_name already set
    
    # 2. Filter out ONLY data associated with this institution
    plaid_items = [pi for pi in plaid_items if pi.institution_name != institution_name]
    
    # Filter Assets: Remove if it matches a removed account ID OR if it's explicitly labeled with this institution
    assets = [a for a in assets if not (
        (a.plaid_account_id and any(a.plaid_account_id.startswith(rid) for rid in removed_account_ids)) or 
        (getattr(a, 'institution_name', None) == institution_name)
    )]
    
    # Filter Debts
    debts = [d for d in debts if not (
        (d.plaid_account_id and any(d.plaid_account_id.startswith(rid) for rid in removed_account_ids)) or 
        (getattr(d, 'institution_name', None) == institution_name)
    )]
    
    # Filter Transactions
    if removed_account_ids:
        transactions = [t for t in transactions if t.account_id not in removed_account_ids]
    
    # Filter Retirement Accounts
    retirement_accounts = [ra for ra in retirement_accounts if ra.id not in removed_account_ids]

    save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, outstanding_checks=outstanding_checks, ignored_flexible=ignored_flexible, user_id=request.uid)
    return jsonify({'success': True})

@app.route('/api/feedback', methods=['POST'])
@token_required
def submit_feedback():
    data = request.get_json()
    topic = data.get('topic')
    content = data.get('content')
    severity = data.get('severity', 'LOW')
    email = getattr(request, 'email', 'Guest/Anonymous')
    
    if not topic or not content:
        return jsonify({'error': "Missing topic or content"}), 400
        
    # Rate limit: 5 feedback submissions per hour
    if not check_rate_limit(request.uid, 'submit_feedback', limit_per_hour=5):
        return jsonify({'error': "You have sent too much feedback recently. Please wait a while."}), 429
        
    success = firestore_db.save_feedback(
        uid=request.uid, 
        email=email, 
        feedback_data={
            'topic': topic,
            'content': content,
            'severity': severity
        }
    )
    if success:
        return jsonify({'success': True})
    else:
        return jsonify({'error': "Failed to save feedback"}), 500


# ─────────────────────────────────────────────────────────────────────────────
# GOALS
# ─────────────────────────────────────────────────────────────────────────────

def take_portfolio_snapshot(user_id, assets, price_map=None):
    """Stores the current total MARKET value of non-cash investments as a daily
    historical snapshot. This is the source of truth for period returns, so it
    must reflect live market prices — NOT cost basis. The Asset model carries no
    current_price, so we price from the supplied price_map (fetched once by the
    caller) or fetch fresh if none was provided."""
    from datetime import datetime
    try:
        db = get_db()
        if not db: return

        # Calculate total MARKET value of non-cash investments
        liquid_types = {'CASH', 'SAVINGS', 'CHECKING', 'HIGH_YIELD_SAVINGS'}
        liquid_tickers = {'CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX', 'TMSXX', 'VBTIX', 'VUSXX', 'SNSXX', 'FZFXX'}

        non_cash = [a for a in assets if a.asset_type.name not in liquid_types and a.ticker not in liquid_tickers]
        if price_map is None and non_cash:
            # No prices passed — fetch them so we never silently fall back to cost basis.
            try:
                price_map = get_multiple_prices([a.ticker for a in non_cash])
            except Exception:
                price_map = {}

        investments_value = 0.0
        for a in non_cash:
            pm = (price_map or {}).get(a.ticker)
            market_price = pm.get('current_price') if isinstance(pm, dict) else None
            # cost_basis is stored PER SHARE (CLAUDE.md rule #7), so it is itself a
            # price-per-share fallback when no live market price is available.
            price = market_price or a.cost_basis or 0
            investments_value += a.shares * price

        if investments_value > 0:
            today_str = datetime.now().strftime('%Y-%m-%d')
            # Use date string as doc ID so we auto-overwrite if synced multiple times today
            ref = db.collection('users').document(user_id).collection('portfolio_snapshots').document(today_str)
            ref.set({
                'date': today_str,
                'total_value': investments_value,
                'source': 'live',  # exact (live prices) — always wins over backfill estimates
                'timestamp': firestore.SERVER_TIMESTAMP
            }, merge=True)
            logging.info(f"Took portfolio snapshot for {user_id}: ${investments_value:.2f}")
    except Exception as e:
        logging.error(f"Error taking snapshot for {user_id}: {e}")

@app.route('/api/goals', methods=['GET'])
@token_required
def get_goals():
    if request.uid == "guest":
        return jsonify({'goals': []})
        
    db = get_db()
    docs = db.collection('users').document(request.uid).collection('goals').order_by('created_at').get()
    goals = []
    for doc in docs:
        g = doc.to_dict()
        g['id'] = doc.id
        goals.append(g)
    return jsonify({'goals': goals})


@app.route('/api/goals', methods=['POST'])
@token_required
def create_goal():
    if request.uid == "guest":
        return jsonify({'error': 'Please sign in or create an account to save goals.'}), 401
        
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()[:100]
    if not name:
        return jsonify({'error': 'Goal name required'}), 400
    goal_type = data.get('type', 'custom')
    allowed_types = {'savings', 'debt_payoff', 'emergency_fund', 'investment', 'custom'}
    if goal_type not in allowed_types:
        goal_type = 'custom'
    try:
        target_amount = float(data.get('target_amount', 0))
        current_amount = float(data.get('current_amount', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid amount'}), 400
    target_date = data.get('target_date', '')
    notes = (data.get('notes') or '').strip()[:500]

    from datetime import datetime as _dt
    goal_doc = {
        'name': name,
        'type': goal_type,
        'target_amount': target_amount,
        'current_amount': current_amount,
        'target_date': target_date,
        'notes': notes,
        'created_at': _dt.utcnow().isoformat(),
    }
    from firestore_db import create_goal_atomic
    goal_id = create_goal_atomic(request.uid, goal_doc)
    if not goal_id:
        return jsonify({'error': 'Failed to create goal'}), 500
    goal_doc['id'] = goal_id
    return jsonify({'goal': goal_doc}), 201


@app.route('/api/goals/<goal_id>', methods=['PUT'])
@token_required
def update_goal(goal_id):
    if request.uid == "guest":
        return jsonify({'error': 'Please sign in or create an account to update goals.'}), 401
        
    data = request.get_json(silent=True) or {}
    allowed_fields = {'name', 'type', 'target_amount', 'current_amount', 'target_date', 'notes'}
    update = {}
    if 'name' in data:
        update['name'] = str(data['name']).strip()[:100]
    if 'type' in data and data['type'] in {'savings', 'debt_payoff', 'emergency_fund', 'investment', 'custom'}:
        update['type'] = data['type']
    for field in ('target_amount', 'current_amount'):
        if field in data:
            try:
                update[field] = float(data[field])
            except (TypeError, ValueError):
                pass
    if 'target_date' in data:
        update['target_date'] = str(data['target_date'])
    if 'notes' in data:
        update['notes'] = str(data['notes']).strip()[:500]
    if not update:
        return jsonify({'error': 'Nothing to update'}), 400
    from firestore_db import update_goal_atomic
    success, _, _ = update_goal_atomic(request.uid, goal_id, update)
    if not success:
        return jsonify({'error': 'Goal not found or update failed'}), 404
    return jsonify({'success': True})


@app.route('/api/goals/<goal_id>', methods=['DELETE'])
@token_required
def delete_goal(goal_id):
    if request.uid == "guest":
        return jsonify({'error': 'Please sign in or create an account to delete goals.'}), 401

    from firestore_db import delete_goal_atomic
    success = delete_goal_atomic(request.uid, goal_id)
    if not success:
        return jsonify({'error': 'Goal not found'}), 404
    return jsonify({'success': True})


@app.route('/api/goals/ai_guidance', methods=['POST'])
@auth_required  # SEC: was @token_required — Claude text call; reject guests
def goal_ai_guidance():
    _ok, _resp = _require_verified_email()
    if not _ok:
        return _resp
    if not check_rate_limit(request.uid, 'goal_guidance', limit_per_hour=15, fail_closed=True):
        return jsonify({'error': 'Rate limit reached. Please wait before requesting more guidance.'}), 429
    if not check_ip_rate_limit('goal_guidance', limit_per_hour=40):
        return jsonify({'error': 'Too many requests from your network. Please try again later.'}), 429

    data = request.get_json(silent=True) or {}
    goal = data.get('goal', {})
    if not goal.get('name'):
        return jsonify({'error': 'Goal data required'}), 400

    user, incomes, assets, debts, _, _, _, _, transactions, paystubs, _, _, _, _, _ = get_user_data(user_id=request.uid, fields=['transactions', 'paystubs'])
    from calculations import calculate_net_worth as _calc_nw
    financial_data = _calc_nw(user, incomes, assets, debts, [], [], paystubs)

    monthly_income = financial_data.get('monthly_income', 0)
    net_worth = financial_data.get('net_worth', 0)

    from datetime import datetime as _dt
    today = _dt.utcnow()
    target_date_str = goal.get('target_date', '')
    months_remaining = None
    if target_date_str:
        try:
            td = _dt.strptime(target_date_str, '%Y-%m-%d')
            diff = (td.year - today.year) * 12 + (td.month - today.month)
            months_remaining = max(1, diff)
        except ValueError:
            pass

    import advisor_service
    sanitize = advisor_service._sanitize_for_ai

    goal_type_labels = {
        'savings': 'savings goal',
        'debt_payoff': 'debt payoff goal',
        'emergency_fund': 'emergency fund goal',
        'investment': 'investment goal',
        'custom': 'financial goal',
    }
    type_label = goal_type_labels.get(goal.get('type', 'custom'), 'financial goal')
    gap = goal.get('target_amount', 0) - goal.get('current_amount', 0)
    monthly_needed = round(gap / months_remaining, 2) if months_remaining and gap > 0 else None

    prompt = f"""A user has set the following {type_label}:
- Goal: {sanitize(goal.get('name', ''))}
- Target: ${goal.get('target_amount', 0):,.2f}
- Current progress: ${goal.get('current_amount', 0):,.2f} ({round(goal.get('current_amount', 0) / (goal.get('target_amount', 1) or 1) * 100, 1)}% complete)
- Target date: {target_date_str or 'not set'}
- Notes: {sanitize(goal.get('notes', '')) or 'none'}

User financial context:
- Monthly gross income: ${monthly_income:,.0f}
- Net worth: ${net_worth:,.0f}
- Total debts: ${sum(d.initial_amount - d.amount_paid for d in debts if d.initial_amount > d.amount_paid):,.0f}
{f'- Months to deadline: {months_remaining}' if months_remaining else ''}
{f'- Estimated monthly contribution needed: ${monthly_needed:,.2f}' if monthly_needed else ''}

Please provide:
1. A brief feasibility assessment (1-2 sentences) — is this realistic given the timeline and income?
2. 3-5 concrete, actionable steps the user can take to reach this goal
3. One specific monthly savings/payment amount to target, with brief reasoning

Keep the response concise and practical. Use dollar amounts where helpful. Do not give investment advice or tax advice. Frame everything as general financial information.
"""

    # Goal AI Guidance — migrated from Gemini to Claude Sonnet 4.6 so all
    # user-facing AI uses the same model. Keeps prompt + rate limit unchanged.
    client, client_err = advisor_service._get_client()
    if client_err:
        logging.error(f"Goal AI guidance: {client_err}")
        return jsonify({'error': 'AI service not configured'}), 503

    try:
        response = client.messages.create(
            model=advisor_service._CLAUDE_MODEL,
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
            timeout=25.0,
        )
        # Concatenate any text blocks in the response (Claude returns a list of content blocks)
        guidance_text = "".join(
            getattr(b, 'text', '') for b in response.content if getattr(b, 'type', '') == 'text'
        ).strip()
        if not guidance_text:
            raise ValueError("Empty response from Claude")
    except Exception as e:
        logging.error(f"Goal AI guidance error: {e}")
        return jsonify({'error': 'AI service temporarily unavailable'}), 503

    return jsonify({'guidance': guidance_text})


# ── Credit Card "No-BS" AI Summary ────────────────────────────────────────────
#
# /api/debts/card_summary
# Takes a card's display name + official Plaid name and returns a concise
# no-fluff analysis: annual fee, top perks (with $ value), best uses, weak
# points, and a verdict on whether it's worth keeping. Cached server-side per
# (user, normalized_card_name) so we don't hit Claude on every render.

def _normalize_card_key(s: str) -> str:
    """Normalize a card name for cache lookup — case-insensitive, whitespace-
    collapsed, trim trademark symbols + account masks. Two cards that differ
    only in casing or a trailing ' …4321' map to the same cache key."""
    if not s:
        return ''
    s = s.lower().replace('®', '').replace('™', '').replace('©', '')
    s = re.sub(r'\s+', ' ', s)
    # Strip trailing 4-digit masks (e.g. "chase sapphire 4321")
    s = re.sub(r'\s*[…\.\-]*\s*\d{4}\s*$', '', s)
    return s.strip()


@app.route('/api/debts/card_summary', methods=['POST'])
@auth_required  # SEC: was @token_required — Claude text call; reject guests
def get_card_summary():
    """Return an AI-generated No-BS summary for a credit card. Cached per user
    in /users/{uid}/card_summaries/{normalized_key} for 30 days."""
    _ok, _resp = _require_verified_email()
    if not _ok:
        return _resp
    if not check_rate_limit(request.uid, 'card_summary', limit_per_hour=10, fail_closed=True):
        return jsonify({'error': 'Rate limit reached. Try again later.'}), 429
    if not check_ip_rate_limit('card_summary', limit_per_hour=30):
        return jsonify({'error': 'Too many requests from your network. Try again later.'}), 429

    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    official_name = (data.get('official_name') or '').strip()
    # Optional user-typed exact card name. Plaid often returns only the rewards
    # program (e.g. "Ultimate Rewards"), which can't identify the specific product
    # (Sapphire vs Freedom vs Ink). When the user tells us the exact card, it wins.
    user_label = (data.get('user_label') or '').strip()
    if not name and not official_name and not user_label:
        return jsonify({'error': 'Card name required'}), 400

    # Prefer the user's exact label, then official_name (carries the product line).
    lookup_name = user_label or official_name or name
    cache_key = _normalize_card_key(lookup_name)
    if not cache_key:
        return jsonify({'error': 'Invalid card name'}), 400

    db = get_db()
    cache_doc = None
    if db and request.uid != 'guest':
        try:
            cache_doc = db.collection('users').document(request.uid) \
                .collection('card_summaries').document(cache_key[:100]).get()
        except Exception as e:
            logging.warning(f"card_summary cache read failed: {e}")
            cache_doc = None

    if cache_doc and cache_doc.exists:
        cached = cache_doc.to_dict() or {}
        ts = cached.get('generated_at')
        try:
            ts_dt = datetime.fromisoformat(ts) if isinstance(ts, str) else None
            fresh = ts_dt and (datetime.utcnow() - ts_dt) < timedelta(days=30)
        except Exception:
            fresh = False
        if fresh and cached.get('summary'):
            return jsonify({
                'summary': cached['summary'],
                'cached': True,
                'generated_at': cached.get('generated_at'),
            })

    # Build prompt. We sanitize input names so a user-controlled name can't
    # inject extra instructions into the prompt (defense in depth).
    sanitize = advisor_service._sanitize_for_ai
    safe_name = sanitize(name)[:120]
    safe_official = sanitize(official_name)[:120]
    safe_user = sanitize(user_label)[:120]

    _identity = (
        f"The user says this card is exactly: {safe_user}. Treat that as authoritative.\n"
        if safe_user else
        "Plaid sometimes returns only the rewards program (e.g. \"Ultimate Rewards\"), "
        "which does NOT identify the specific product. If the name doesn't pin down the "
        "exact card, say which issuer/family it's from and ask the user to confirm the "
        "exact card — don't guess perks for a specific product you can't identify.\n"
    )

    prompt = f"""You are giving a No-BS analysis of a credit card a user holds.

Card display name: {safe_name or 'unknown'}
Official issuer name: {safe_official or safe_name or 'unknown'}
{_identity}
Start by stating the card you're analyzing (e.g. "Chase Sapphire Preferred").
Do not invent perks you're not confident about.

Format your response with these labeled sections (no markdown headers, just
bold-style labels with a colon — keep it scannable):

CARD: The specific card name you're analyzing (or the issuer/family if unsure).

ANNUAL FEE: One line — exact $ if known, "no annual fee" if free, or "unknown".

REWARDS: The earn structure in 1-2 lines (e.g. "3x dining & travel, 1x else").

TOP PERKS: 2-4 bullets, each starting with "•". Quantify with $ where possible.
Skip generic perks like "Visa Zero Liability".

BEST USES: 1-2 short lines — what spending/scenarios this card shines for.

WATCH OUT: 1-2 short lines on weak points (high APR, FX fees, etc.).

HOW IT COMPARES: 1-2 lines naming 1-2 competitor cards and when each beats this
one (e.g. "vs Amex Gold: Gold wins on dining/groceries but has a $325 fee").

VERDICT: One sentence — is this worth holding? Be direct.

Keep the whole response under 260 words. No disclaimers about consulting the
issuer. No "always check current terms" boilerplate."""

    client, client_err = advisor_service._get_client()
    if client_err:
        logging.error(f"Card summary: {client_err}")
        return jsonify({'error': 'AI service not configured'}), 503

    try:
        response = client.messages.create(
            model=advisor_service._CLAUDE_MODEL,
            max_tokens=700,
            messages=[{"role": "user", "content": prompt}],
            timeout=25.0,
        )
        summary_text = "".join(
            getattr(b, 'text', '') for b in response.content if getattr(b, 'type', '') == 'text'
        ).strip()
        if not summary_text:
            raise ValueError("Empty response from Claude")
    except Exception as e:
        logging.error(f"Card summary AI error: {e}")
        return jsonify({'error': 'AI service temporarily unavailable'}), 503

    # Cache it for 30 days
    if db and request.uid != 'guest':
        try:
            db.collection('users').document(request.uid) \
                .collection('card_summaries').document(cache_key[:100]).set({
                    'summary': summary_text,
                    'card_name': safe_name,
                    'official_name': safe_official,
                    'generated_at': datetime.utcnow().isoformat(),
                })
        except Exception as e:
            logging.warning(f"card_summary cache write failed: {e}")

    return jsonify({
        'summary': summary_text,
        'cached': False,
        'generated_at': datetime.utcnow().isoformat(),
    })


# ── HYSA / cash-account APY ───────────────────────────────────────────────────
# Plaid has no deposit-APY field, so the yield can't be auto-pulled. We let the
# user store an APY per account (manual), and offer a Claude-powered ESTIMATE as a
# starting point (clearly labeled — rates change and the model's knowledge is dated).

@app.route('/api/hysa/apy_estimate', methods=['POST'])
@auth_required
def hysa_apy_estimate():
    """Claude-estimated APY for a named cash/savings product. An estimate to confirm,
    not a live rate."""
    _ok, _resp = _require_verified_email()
    if not _ok:
        return _resp
    if not check_rate_limit(request.uid, 'apy_estimate', limit_per_hour=15, fail_closed=True):
        return jsonify({'error': 'Rate limit reached. Try again later.'}), 429
    if not check_ip_rate_limit('apy_estimate', limit_per_hour=40):
        return jsonify({'error': 'Too many requests from your network.'}), 429

    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    institution = (data.get('institution') or '').strip()
    if not name and not institution:
        return jsonify({'error': 'Account name required'}), 400

    safe = advisor_service._sanitize_for_ai(f"{institution} {name}".strip())[:160]
    prompt = f"""Estimate the current APY (annual percentage yield) for this cash or savings account: "{safe}".

Reply with ONLY a JSON object, no prose:
{{"apy": <number as a percent, e.g. 4.6>, "note": "<one short sentence; name the product if you recognize it>"}}

If you recognize the product (e.g. Vanguard Cash Plus, Marcus by Goldman Sachs, Apple Savings, Wealthfront/Betterment Cash, Fidelity SPAXX/money market, Ally/SoFi/Amex HYSA), use its typical recent APY. If you don't, give a reasonable current HYSA estimate. APYs change frequently and your knowledge may be out of date — this is an ESTIMATE for the user to verify."""

    client, client_err = advisor_service._get_client()
    if client_err:
        return jsonify({'error': 'AI service not configured'}), 503
    try:
        response = client.messages.create(
            model=advisor_service._CLAUDE_MODEL,
            max_tokens=150,
            messages=[{"role": "user", "content": prompt}],
            timeout=20.0,
        )
        text = "".join(getattr(b, 'text', '') for b in response.content if getattr(b, 'type', '') == 'text').strip()
        import json as _json
        m = re.search(r'\{.*\}', text, re.DOTALL)
        parsed = _json.loads(m.group(0)) if m else {}
        apy = round(float(parsed.get('apy')), 2)
        if apy < 0 or apy > 100:
            raise ValueError("apy out of range")
        note = str(parsed.get('note') or '')[:200]
    except Exception as e:
        logging.error(f"apy_estimate error: {e}")
        return jsonify({'error': 'Could not estimate APY'}), 503
    return jsonify({'apy': apy, 'note': note, 'estimated': True})


@app.route('/api/hysa/apy', methods=['PUT'])
@auth_required
def save_hysa_apy():
    """Persist (or clear) the APY for one account, keyed by plaid_account_id or a
    manual key. Stored in /users/{uid}/account_apy/{key}."""
    if request.uid == 'guest':
        return jsonify({'error': 'Login required'}), 401
    data = request.get_json(silent=True) or {}
    key = (data.get('key') or '').strip()
    if not key:
        return jsonify({'error': 'key required'}), 400
    db = get_db()
    if not db:
        return jsonify({'error': 'DB unavailable'}), 500
    ref = db.collection('users').document(request.uid).collection('account_apy').document(key[:200])
    if data.get('apy') in (None, ''):
        ref.delete()
        return jsonify({'success': True, 'deleted': True})
    try:
        apy = round(float(data.get('apy')), 2)
    except Exception:
        return jsonify({'error': 'invalid apy'}), 400
    if apy < 0 or apy > 100:
        return jsonify({'error': 'apy out of range (0–100)'}), 400
    ref.set({
        'apy': apy,
        'source': data.get('source', 'manual'),
        'updated_at': datetime.utcnow().isoformat(),
    })
    return jsonify({'success': True, 'apy': apy})


@app.route('/api/realized_override', methods=['PUT'])
@auth_required
def save_realized_override():
    """Persist (or clear) a user-entered realized-gains figure from their brokerage.
    Plaid-derived realized P&L is only an estimate for active option traders (no wash
    sales, incomplete/transferred lots), so let the user pin the broker's true number."""
    if request.uid == 'guest':
        return jsonify({'error': 'Login required'}), 401
    data = request.get_json(silent=True) or {}
    db = get_db()
    if not db:
        return jsonify({'error': 'DB unavailable'}), 500
    ref = db.collection('users').document(request.uid).collection('overrides').document('realized_gains')
    if data.get('total') in (None, ''):
        ref.delete()
        return jsonify({'success': True, 'deleted': True})
    try:
        total = round(float(data.get('total')), 2)
    except Exception:
        return jsonify({'error': 'invalid total'}), 400
    note = str(data.get('note') or '')[:200]
    ref.set({
        'total': total,
        'note': note,
        'source': 'broker',
        'updated_at': datetime.utcnow().isoformat(),
    })
    return jsonify({'success': True, 'total': total})


# ── Category Rules CRUD ───────────────────────────────────────────────────────

@app.route('/api/custom_rules', methods=['GET'])
@token_required
def get_custom_rules():
    """Return all custom categorization rules for the user, with match counts."""
    if request.uid == 'guest':
        return jsonify({'rules': []}), 200
    try:
        user, incomes, assets, debts, ra, ins, pi, budgets, transactions, paystubs, custom_rules, _, _, _, _ = get_user_data(user_id=request.uid)
        # Compute how many transactions each rule currently matches
        rules_out = []
        for r in custom_rules:
            # One-way substring: rule pattern must be inside the transaction name.
            pattern_lc = r.merchant_name.lower()
            match_count = sum(1 for t in transactions if pattern_lc in t.name.lower())
            rules_out.append({
                'id': r.id,
                'merchant_name': r.merchant_name,
                'category': r.category,
                'match_count': match_count,
            })
        # Sort by match count desc so most-impactful rules surface first
        rules_out.sort(key=lambda x: x['match_count'], reverse=True)
        return jsonify({'rules': rules_out})
    except Exception as e:
        logging.error(f"get_custom_rules error for {request.uid}: {e}")
        return jsonify({'error': 'Could not load rules.'}), 500


@app.route('/api/custom_rules', methods=['POST'])
@token_required
def create_custom_rule():
    """Create a new rule and optionally apply it to existing transactions."""
    if request.uid == 'guest':
        return jsonify({'error': 'Login required.'}), 401
    data = request.get_json() or {}
    merchant_name = (data.get('merchant_name') or '').strip()
    category = (data.get('category') or '').strip()
    apply_retroactive = data.get('apply_retroactive', True)
    if not merchant_name or not category:
        return jsonify({'error': 'merchant_name and category are required.'}), 400
    try:
        from models import CustomRule
        user, incomes, assets, debts, ra, ins, pi, budgets, transactions, paystubs, custom_rules, hco, cc, oc, igf = get_user_data(user_id=request.uid)
        # Soft cap to prevent runaway rule lists (each rule is checked against every transaction
        # on every Plaid sync — performance degrades linearly).
        MAX_RULES = 100
        if len(custom_rules) >= MAX_RULES:
            return jsonify({'error': f'You\'ve reached the {MAX_RULES}-rule limit. Delete an existing rule to create a new one.'}), 400
        # Prevent duplicates
        existing = next((r for r in custom_rules if r.merchant_name.lower() == merchant_name.lower()), None)
        if existing:
            return jsonify({'error': f'A rule for "{merchant_name}" already exists. Use PUT to update it.'}), 409
        new_rule = CustomRule(merchant_name=merchant_name, category=category, user_id=request.uid)
        custom_rules.append(new_rule)
        affected = 0
        if apply_retroactive:
            pattern_lc = merchant_name.lower()
            for t in transactions:
                if pattern_lc in t.name.lower():
                    t.category = category
                    affected += 1
        save_user_data(user, incomes, assets, debts, ra, ins, pi, budgets=budgets, transactions=transactions,
                       paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=hco,
                       custom_categories=cc, outstanding_checks=oc, ignored_flexible=igf, user_id=request.uid)
        return jsonify({'rule': {'id': new_rule.id, 'merchant_name': new_rule.merchant_name,
                                  'category': new_rule.category, 'match_count': affected},
                        'affected_transactions': affected}), 201
    except Exception as e:
        logging.error(f"create_custom_rule error for {request.uid}: {e}")
        return jsonify({'error': 'Could not create rule.'}), 500


@app.route('/api/custom_rules/<rule_id>', methods=['PUT'])
@token_required
def update_custom_rule(rule_id):
    """Update an existing rule's merchant pattern or category."""
    if request.uid == 'guest':
        return jsonify({'error': 'Login required.'}), 401
    data = request.get_json() or {}
    new_merchant = (data.get('merchant_name') or '').strip() or None
    new_category = (data.get('category') or '').strip() or None
    apply_retroactive = data.get('apply_retroactive', True)
    if not new_merchant and not new_category:
        return jsonify({'error': 'Provide at least one of merchant_name or category.'}), 400
    try:
        user, incomes, assets, debts, ra, ins, pi, budgets, transactions, paystubs, custom_rules, hco, cc, oc, igf = get_user_data(user_id=request.uid)
        rule = next((r for r in custom_rules if r.id == rule_id), None)
        if not rule:
            return jsonify({'error': 'Rule not found.'}), 404
        old_merchant = rule.merchant_name
        if new_merchant:
            rule.merchant_name = new_merchant
        if new_category:
            rule.category = new_category
        affected = 0
        if apply_retroactive:
            pattern = rule.merchant_name.lower()
            for t in transactions:
                if pattern in t.name.lower():
                    t.category = rule.category
                    affected += 1
        save_user_data(user, incomes, assets, debts, ra, ins, pi, budgets=budgets, transactions=transactions,
                       paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=hco,
                       custom_categories=cc, outstanding_checks=oc, ignored_flexible=igf, user_id=request.uid)
        return jsonify({'rule': {'id': rule.id, 'merchant_name': rule.merchant_name,
                                  'category': rule.category},
                        'affected_transactions': affected})
    except Exception as e:
        logging.error(f"update_custom_rule error for {request.uid}: {e}")
        return jsonify({'error': 'Could not update rule.'}), 500


@app.route('/api/custom_rules/<rule_id>', methods=['DELETE'])
@token_required
def delete_custom_rule(rule_id):
    """Delete a rule. Existing transactions keep their current category."""
    if request.uid == 'guest':
        return jsonify({'error': 'Login required.'}), 401
    try:
        user, incomes, assets, debts, ra, ins, pi, budgets, transactions, paystubs, custom_rules, hco, cc, oc, igf = get_user_data(user_id=request.uid)
        rule = next((r for r in custom_rules if r.id == rule_id), None)
        if not rule:
            return jsonify({'error': 'Rule not found.'}), 404
        custom_rules = [r for r in custom_rules if r.id != rule_id]
        # Also delete from subcollection directly
        try:
            get_db().collection('users').document(request.uid).collection('custom_rules').document(rule_id).delete()
        except Exception:
            pass
        save_user_data(user, incomes, assets, debts, ra, ins, pi, budgets=budgets, transactions=transactions,
                       paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=hco,
                       custom_categories=cc, outstanding_checks=oc, ignored_flexible=igf, user_id=request.uid)
        return jsonify({'message': 'Rule deleted.'})
    except Exception as e:
        logging.error(f"delete_custom_rule error for {request.uid}: {e}")
        return jsonify({'error': 'Could not delete rule.'}), 500
