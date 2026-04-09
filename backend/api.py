# API Version: 1.1.1 - Defensive Plaid Sync & 400 Fix
import re
import stripe
from flask import Flask, jsonify, request
from flask_cors import CORS
from price_service import get_current_price, get_multiple_prices, validate_ticker
from calculations import calculate_net_worth
from models import User, Income, Asset, Debt, AssetType, RetirementAccount, AccountType, Insurance, InsuranceFrequency, HourlyType, PlaidItem, Budget, Transaction, Paystub, IncomeType, FilingStatus, USState, TaxTreatment, DebtType, EmploymentType
from firestore_db import get_user_data, save_user_data, get_db, wipe_user_subcollections, save_feedback
from auth import token_required, auth_required
import uuid
import plaid_service
import advisor_service
import os
from datetime import datetime, timedelta
import logging
import firestore_db
import statement_processor
import diagnostics_service
from concurrent.futures import ThreadPoolExecutor

app = Flask(__name__)
CORS(app, supports_credentials=True, resources={r"/api/*": {
    "origins": [
        "https://personal-finance-app-18cbc.web.app",
        "https://personal-finance-app-18cbc.firebaseapp.com",
        "http://localhost:3000"
    ],
    "allow_headers": ["Authorization", "Content-Type"],
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}})

stripe.api_key = os.getenv('STRIPE_SECRET_KEY', '').strip()
STRIPE_PRICE_ID = os.getenv('STRIPE_PRICE_ID', '').strip()
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET', '').strip()
APP_URL = "https://personal-finance-app-18cbc.web.app"

@app.route('/api/diagnostics', methods=['GET'])
def get_diagnostics():
    """SEC-D: Returns health check and secret sanitization status."""
    return jsonify(diagnostics_service.get_secret_diagnostics())

# ARCH-4: Simple Firestore-based rate limiting
def check_rate_limit(uid, action, limit_per_hour=20):
    """
    Checks if a user has exceeded the hourly limit for a specific action.
    Uses Firestore for persistence across serverless instances.
    """
    if uid == "guest": return True # Skip for guests on non-sensitive routes
    
    db = get_db()
    if not db: return True
    
    now = datetime.utcnow()
    one_hour_ago = now - timedelta(hours=1)
    
    # Store/Update usage in a dedicated subcollection or document
    # Using a document per user/action for simplicity
    limit_ref = db.collection('rate_limits').document(f"{uid}_{action}")
    doc = limit_ref.get()
    
    usage = []
    if doc.exists:
        data = doc.to_dict()
        # Filter only timestamps within the last hour
        usage = [t for t in data.get('calls', []) if t.replace(tzinfo=None) > one_hour_ago]
    
    if len(usage) >= limit_per_hour:
        return False
        
    # Add current call and save
    usage.append(now)
    limit_ref.set({'calls': usage})
    return True

def asset_to_dict(asset, price_map=None):
    is_cash_ticker = asset.ticker in ['CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX']
    
    current_price = 1.0
    daily_change_usd = 0.0
    daily_change_percent = 0.0
    sector = 'Financial Services'
    
    # If it's not a basic cash account, try to get price and sector
    if (asset.asset_type not in [AssetType.CASH, AssetType.HOUSING, AssetType.SAVINGS, AssetType.CHECKING, AssetType.HIGH_YIELD_SAVINGS] and not is_cash_ticker):
        if price_map and asset.ticker in price_map:
            p_data = price_map[asset.ticker]
        else:
            p_data = get_current_price(asset.ticker)
            
        if p_data:
            current_price = p_data.get('current_price', 1.0)
            daily_change_usd = p_data.get('daily_change_usd', 0.0)
            daily_change_percent = p_data.get('daily_change_percent', 0.0)
            sector = p_data.get('sector', 'Other')
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
        'is_net_primary': getattr(p, 'is_net_primary', False)
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

@app.route('/api/auth_status', methods=['GET'])
@auth_required
def get_auth_status():
    email = getattr(request, 'email', None)
    return jsonify({'uid': request.uid, 'email': email, 'is_authorized': is_user_authorized(request.uid, email)})

@app.route('/api/admin/grant_premium', methods=['POST'])
def grant_premium():
    """Admin: directly grant premium to a user by email or UID, no Stripe required."""
    body = request.get_json(silent=True) or {}
    if body.get('admin_key') != os.getenv('ADMIN_MIGRATION_KEY', 'fhq-migrate-2026'):
        return jsonify({'error': 'Forbidden'}), 403

    email = (body.get('email') or '').strip().lower()
    uid = (body.get('uid') or '').strip()

    db = get_db()
    if not db:
        return jsonify({'error': 'DB unavailable'}), 500

    try:
        from firebase_admin import auth as fb_auth
        if not uid and email:
            user_record = fb_auth.get_user_by_email(email)
            uid = user_record.uid

        if not uid:
            return jsonify({'error': 'Provide email or uid'}), 400

        db.collection('users').document(uid).set({'is_subscribed': True}, merge=True)
        db.collection('whitelist').document(uid).set({'granted': True, 'email': email}, merge=True)
        logging.info(f"Admin grant_premium: uid={uid} email={email}")
        return jsonify({'success': True, 'uid': uid, 'email': email})
    except Exception as e:
        logging.error(f"grant_premium error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/migrate_whitelist_to_subscribed', methods=['POST'])
def migrate_whitelist_to_subscribed():
    """One-time migration: stamps is_subscribed=True on users docs for all whitelist entries."""
    body = request.get_json(silent=True) or {}
    if body.get('admin_key') != os.getenv('ADMIN_MIGRATION_KEY', 'fhq-migrate-2026'):
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
            user_ref = db.collection('users').document(uid)
            user_ref.set({
                'is_subscribed': True,
                'stripe_customer_id': customer_id,
                'stripe_subscription_id': subscription_id
            }, merge=True)
            db.collection('whitelist').document(uid).set({'stripe': True}, merge=True)
            logging.info(f"Subscription activated for uid={uid}")

        elif event_type == 'customer.subscription.deleted':
            subscription = event['data']['object']
            customer_id = subscription.get('customer')
            users = db.collection('users').where('stripe_customer_id', '==', customer_id).limit(1).get()
            for user_doc in users:
                user_doc.reference.set({'is_subscribed': False, 'stripe_subscription_id': None}, merge=True)
                db.collection('whitelist').document(user_doc.id).delete()
                logging.info(f"Subscription cancelled for uid={user_doc.id}")

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

@app.route('/api/health')
def health_check():
    return jsonify({'status': 'ok'})
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
        net_worth_data['paystubs'] = [{'id': p.id, 'date': p.date, 'gross_amount': p.gross_amount, 'net_amount': p.net_amount, 'tax_withheld': p.tax_withheld, 'employer': p.employer, 'is_net_primary': getattr(p, 'is_net_primary', False)} for p in paystubs]
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
        return jsonify(net_worth_data)
    except Exception as e:
        import traceback
        logging.error(f"DASHBOARD ERROR: {str(e)}")
        logging.error(traceback.format_exc())
        return jsonify({'error': 'Internal server error'}), 500

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
            cost_basis=450000,
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
    # Capture current paystub IDs before any modifications (used to detect deletions below)
    _paystubs_before_save = {p.id for p in paystubs}

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
            incoming_assets.append(Asset(
                ticker=asset_data.get('ticker', '').upper(),
                shares=float(asset_data.get('shares', 0)),
                cost_basis=float(asset_data.get('cost_basis', 0)),
                total_gain=float(asset_data.get('total_gain', 0)) if asset_data.get('total_gain') is not None else None,
                asset_type=safe_enum(AssetType, asset_data.get('asset_type'), AssetType.STOCK),
                retirement_account_id=asset_data.get('retirement_account_id'),
                plaid_account_id=asset_data.get('plaid_account_id'),
                institution_name=asset_data.get('institution_name', 'Manual'),
                tax_treatment=safe_enum(TaxTreatment, asset_data.get('tax_treatment'), TaxTreatment.TAXABLE)
            ))
        
        # Merge all (existing manual + incoming)
        merged = {}
        # Prioritize manual assets or keep them separate? 
        # User wants "combined for ease", so we combine by (ticker, retirement_account_id)
        all_to_merge = assets + incoming_assets
        for a in all_to_merge:
            key = (a.ticker, a.retirement_account_id, a.tax_treatment.name)
            if key not in merged:
                merged[key] = a
            else:
                existing = merged[key]
                old_total_cost = existing.shares * existing.cost_basis
                new_total_cost = a.shares * a.cost_basis
                total_shares = existing.shares + a.shares
                
                if total_shares > 0:
                    existing.cost_basis = (old_total_cost + new_total_cost) / total_shares
                
                existing.shares = total_shares
                
                # Sum total gains if both exist
                if a.total_gain is not None:
                    existing.total_gain = (existing.total_gain or 0) + a.total_gain
                
                if a.institution_name and existing.institution_name != a.institution_name:
                    if existing.institution_name != 'Multiple Accounts':
                        existing.institution_name = 'Multiple Accounts'
        assets = list(merged.values())

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
        paystubs = [Paystub(id=p.get('id', str(uuid.uuid4())), user_id=uid_for_ids, date=p['date'], gross_amount=float(p['gross_amount']), net_amount=float(p.get('net_amount', 0)), tax_withheld=float(p.get('tax_withheld', 0)), employer=p.get('employer'), is_net_primary=bool(p.get('is_net_primary', False))) for p in data['paystubs']]

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
    _newly_excluded_paystubs = _paystubs_before_save - _paystubs_after_save
    if _newly_excluded_paystubs:
        user.excluded_paystub_ids = list(set(getattr(user, 'excluded_paystub_ids', [])) | _newly_excluded_paystubs)
        logging.info(f"Permanently excluding paystub IDs from sync: {_newly_excluded_paystubs}")

    save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, outstanding_checks=outstanding_checks, ignored_flexible=ignored_flexible, user_id=uid)

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
    net_worth_data['paystubs'] = [{'id': p.id, 'date': p.date, 'gross_amount': p.gross_amount, 'net_amount': p.net_amount, 'tax_withheld': p.tax_withheld, 'employer': p.employer} for p in paystubs]
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
    if not check_rate_limit(request.uid, 'plaid_sync', limit_per_hour=5):
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
        active_plaid_items = [pi for pi in plaid_items if pi.access_token]
        if not active_plaid_items:
             logging.warning(f"No active plaid items for user {request.uid}")
             return jsonify({'error': "Accounts require re-connection."}), 400

        with ThreadPoolExecutor(max_workers=min(len(active_plaid_items), 10)) as executor:
            future_to_pi = {executor.submit(plaid_service.sync_plaid_data, pi.access_token, request.uid, custom_rules): pi for pi in active_plaid_items}
            
            for future in future_to_pi:
                pi = future_to_pi[future]
                try:
                    res = future.result()
                    new_assets, new_ra, new_transactions, new_debts, new_paystubs, new_incomes, synced_account_ids = res
                    all_new_assets.extend(new_assets)
                    all_new_ra.extend(new_ra)
                    all_new_transactions.extend(new_transactions)
                    all_new_debts.extend(new_debts)
                    all_new_paystubs.extend(new_paystubs)
                    all_new_incomes.extend(new_incomes)
                    synced_ids_total.extend(synced_account_ids)
                    pi.last_sync = datetime.now().isoformat()
                    logging.info(f"Successfully synced institution {pi.institution_name}")
                except Exception as e:
                    logging.error(f"Failed to sync institution {pi.institution_name}: {e}")
        
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
        for np in all_new_paystubs:
            if np.id in _excluded_paystub_ids:
                logging.info(f"Skipping excluded paystub: {np.id} ({np.employer})")
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
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, _, custom_categories, outstanding_checks = get_user_data(user_id=uid)
    save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=True, custom_categories=custom_categories, outstanding_checks=outstanding_checks, user_id=uid)
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
        print(f"DEBUG_SUBS: {uid} updating prefs: {data}")
        
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
        print(f"ERROR in subscription_preferences: {str(e)}")
        return jsonify({'error': str(e)}), 500

    price_map = get_multiple_prices([a.ticker for a in assets])
    
    net_worth_data = calculate_net_worth(user, incomes, assets, debts, retirement_accounts, insurances, paystubs)
    net_worth_data['assets'] = [asset_to_dict(a, price_map) for a in assets]
    net_worth_data['incomes'] = [income_to_dict(i) for i in incomes]
    net_worth_data['debts'] = [debt_to_dict(d) for d in debts]
    net_worth_data['retirement_accounts'] = [retirement_account_to_dict(ra) for ra in retirement_accounts]
    net_worth_data['insurances'] = [get_insurance_to_dict(ins) for ins in insurances]
    net_worth_data['budgets'] = [budget_to_dict(b) for b in budgets]
    net_worth_data['transactions'] = [transaction_to_dict(t) for t in transactions]
    net_worth_data['paystubs'] = [{'id': p.id, 'date': p.date, 'gross_amount': p.gross_amount, 'net_amount': p.net_amount, 'tax_withheld': p.tax_withheld, 'employer': p.employer} for p in paystubs]
    net_worth_data['filing_status'] = user.filing_status.name
    net_worth_data['state'] = user.state.name
    net_worth_data['employment_type'] = getattr(user, 'employment_type', EmploymentType.W2).name
    net_worth_data['business_deductions'] = getattr(user, 'business_deductions', 0.0)
    net_worth_data['dependents'] = getattr(user, 'dependents', 0)
    net_worth_data['outstanding_checks'] = [{'id': c.id, 'amount': c.amount, 'payee': c.payee, 'date_written': c.date_written, 'status': c.status.name, 'plaid_transaction_id': c.plaid_transaction_id} for c in outstanding_checks]
    _is_authorized = is_user_authorized(uid, getattr(request, 'email', None))
    _is_subscribed = getattr(user, 'is_subscribed', False)
    _is_premium = _is_subscribed or _is_authorized
    net_worth_data['is_authorized'] = _is_premium
    net_worth_data['is_subscribed'] = _is_premium
    return jsonify(net_worth_data)

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
        net_worth_data['paystubs'] = [{'id': p.id, 'date': p.date, 'gross_amount': p.gross_amount, 'net_amount': p.net_amount, 'tax_withheld': p.tax_withheld, 'employer': p.employer, 'is_net_primary': getattr(p, 'is_net_primary', False)} for p in paystubs]
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
        
    # ARCH-4: Strict Rate limit for AI Advisor (20 calls / hour)
    if not check_rate_limit(request.uid, 'ask_advisor', limit_per_hour=20):
        return jsonify({'error': "AI Advisor limit reached. Please try again in an hour."}), 429

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
    financial_data['contextual_memory'] = memory_string # Persistent memory
    
    # 3. Reflection middleware (Background task)
    def reflect_and_save():
        import advisor_service
        new_fact = advisor_service.extract_user_memory(user_prompt, memory_string)
        if new_fact:
            firestore_db.save_user_memory(
                user_id=request.uid, 
                fact_id=new_fact.get('fact_id'), 
                category=new_fact.get('category'), 
                content=new_fact.get('content')
            )
            
    import threading
    threading.Thread(target=reflect_and_save).start()
    
    # 4. Get advice from high-tier logic
    advice = advisor_service.get_financial_advice(user_prompt, financial_data)
    return jsonify({'advice': advice})

@app.route('/api/health_brief', methods=['GET'])
@auth_required
def get_health_brief():
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories, outstanding_checks, ignored_flexible = get_user_data(user_id=request.uid)
    
    memory_string = get_contextual_memory(request.uid)
    
    try:
        from tax_logic import calculate_taxes
        tax_results = calculate_taxes(user.state.name, incomes)
    except Exception:
        tax_results = {}
        
    # Calculate simplistic live values for the brief context
    total_assets = sum((a.shares * a.cost_basis) for a in assets)
    total_debts = sum(d.remaining_balance for d in debts)
        
    financial_data = {
        'real_time_net_worth': total_assets - total_debts,
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
@token_required
def upload_statement():
    uid = "demo_user" if request.uid == "guest" else request.uid
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
        
    if ext == '.csv':
        try:
            content = file.read().decode('utf-8')
            new_transactions = statement_processor.detect_and_parse_csv(content, uid)
            if new_transactions:
                return process_extracted_transactions(new_transactions, uid)
            file.seek(0) # Fallback to AI if parsing returns empty
        except Exception as e:
            file.seek(0)
            
    # AI Fallback Path (PDFs, Images, and unrecognized CSVs)
    import re
    raw_api_key = os.environ.get('GEMINI_API_KEY', '')
    api_key = re.sub(r'[^a-zA-Z0-9_\-]', '', raw_api_key).strip()
    if not api_key:
        return jsonify({'error': "Gemini Support is currently disabled (No API Key)."}), 500
        
    # ARCH-4: Rate Limiting specific to expensive AI features
    if not check_rate_limit(request.uid, 'extract_statement', limit_per_hour=10):
        return jsonify({'error': "Upload limit reached. Please try again later."}), 429
        
    import google.generativeai as genai
    import tempfile
    import json
    import uuid
    from models import Transaction
    
    genai.configure(api_key=api_key)
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
            file.save(temp_file.name)
            temp_path = temp_file.name
            
        system_instruction = "You are an extreme-precision document data extraction pipeline. You must extract every individual transaction line item from the provided bank or credit card statement. Return ONLY a valid JSON Array of objects. Each object MUST have these exact 4 keys: 'date' (string, YYYY-MM-DD), 'name' (string, the merchant or description), 'amount' (float, MUST be negative (-) for purchases/withdrawals, and positive (+) for deposits/payments/refunds!), and 'category' (string, best guess or 'Other'). Do NOT include markdown blocks like ```json."
        prompt = "Extract all transactions from this statement. Output a raw JSON Array, nothing else."

        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=system_instruction,
            generation_config={"response_mime_type": "application/json"}
        )

        if ext in {'.png', '.jpg', '.jpeg'}:
            from PIL import Image as PILImage
            pil_image = PILImage.open(temp_path)
            response = model.generate_content([pil_image, prompt])
            os.remove(temp_path)
        else:  # PDF — pass bytes inline to avoid File API v1beta limitation
            with open(temp_path, 'rb') as f:
                pdf_bytes = f.read()
            os.remove(temp_path)
            response = model.generate_content([
                {"mime_type": "application/pdf", "data": pdf_bytes},
                prompt
            ])
            
        parsed_array = json.loads(response.text)
        
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
        
    except Exception as e:
        import traceback
        logging.error(f"AI Extraction Error: {e} - {traceback.format_exc()}")
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': 'Failed to analyze statement'}), 500

@app.route('/api/extract-document', methods=['POST'])
@token_required
def extract_document():
    # ARCH-4: Rate Limiting specific to expensive AI features
    if not check_rate_limit(request.uid, 'extract_doc', limit_per_hour=20):
        return jsonify({'error': "Extraction limit reached. Please try again later."}), 429
        
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

    import re
    raw_api_key = os.environ.get('GEMINI_API_KEY', '')
    api_key = re.sub(r'[^a-zA-Z0-9_\-]', '', raw_api_key).strip()
    if not api_key:
        return jsonify({'error': "API key not configured. Cannot process image."}), 500
        
    import google.generativeai as genai
    import tempfile
    import json
    
    genai.configure(api_key=api_key)

    try:
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
            file.save(temp_file.name)
            temp_path = temp_file.name
            
        if doc_type == 'check':
            system_instruction = "You are a precise financial document extraction API. Analyze the provided check image. Return ONLY a valid JSON object with the following keys: amount (float, just the numerical value), payee (string, who the check is written to), and date_written (string, format YYYY-MM-DD). Do not include any markdown formatting or conversational text. If a value is missing or illegible, return 0.0 or null."
            prompt = "Extract the check data from this image."
        elif doc_type == 'insurance':
            system_instruction = "You are a precise insurance policy auditor. Analyze the provided insurance document. Extract 'the juice'—the key benefits, liabilities, risks, and summary of the policy. Return ONLY a valid JSON object with the following keys: insurance_name (string), insurance_type (string, one of: Auto, Health, Life, Home, Other), premium_amount (float), frequency (string: MONTHLY, EVERY_6_MONTHS, YEARLY), deductible (float), coverage_summary (string, max 500 chars summarizes benefits/limits and what is actually covered), and advisor_observations (string, max 500 chars comparing to standards, spotting gaps, or noting value). Do not include any markdown formatting or conversational text. If a value is missing, return 0.0 or null."
            prompt = "Audit this insurance policy and provide a rundown."
        else:
            system_instruction = "You are a precise financial document extraction API. Analyze the provided W-2 or paystub. Return ONLY a valid JSON object with the following keys: gross_income (float), net_income (float), pay_date (string, YYYY-MM-DD), federal_taxes_withheld (float), state_taxes_withheld (float), social_security_withheld (float), medicare_withheld (float), and employer_name (string). Do not include any markdown formatting or conversational text. If a value is missing or illegible, return 0.0 or null."
            prompt = "Extract the financial data from this document."

        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=system_instruction,
            generation_config={"response_mime_type": "application/json"}
        )

        # Pass data inline to avoid File API v1beta limitation with gemini-1.5-flash
        if ext in {'.png', '.jpg', '.jpeg'}:
            from PIL import Image as PILImage
            pil_image = PILImage.open(temp_path)
            response = model.generate_content([pil_image, prompt])
            os.remove(temp_path)
        else:  # PDF — read bytes and pass inline (no File API)
            with open(temp_path, 'rb') as f:
                pdf_bytes = f.read()
            os.remove(temp_path)
            response = model.generate_content([
                {"mime_type": "application/pdf", "data": pdf_bytes},
                prompt
            ])
            
        result_json = json.loads(response.text)
        return jsonify({'success': True, 'data': result_json})
        
    except Exception as e:
        import traceback
        logging.error(f"OCR Error: {e} - {traceback.format_exc()}")
        # Cleanup local file if it still exists
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': 'Failed to extract document'}), 500

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

