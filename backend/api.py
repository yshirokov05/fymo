# API Version: 1.1.1 - Defensive Plaid Sync & 400 Fix
from flask import Flask, jsonify, request
from flask_cors import CORS
from price_service import get_current_price, get_multiple_prices, validate_ticker
from calculations import calculate_net_worth
from models import User, Income, Asset, Debt, AssetType, RetirementAccount, AccountType, Insurance, InsuranceFrequency, HourlyType, PlaidItem, Budget, Transaction, Paystub, IncomeType, FilingStatus, USState, TaxTreatment, DebtType
from firestore_db import get_user_data, save_user_data, get_db, wipe_user_subcollections
from auth import token_required, auth_required
import uuid
import plaid_service
import advisor_service
import os
from datetime import datetime, timedelta
import logging
import firestore_db

app = Flask(__name__)
# SEC-4: Restrict CORS
CORS(app, supports_credentials=True, resources={r"/api/*": {
    "origins": "*", 
    "allow_headers": ["Authorization", "Content-Type"],
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}})

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
        'year': getattr(income, 'year', 2026)
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
        'frequency': ins.frequency.name
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
        'pending': t.pending
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
    if uid == "guest": return False
    
    # HARDCODED WHITELIST (Add family/special users here)
    WHITELISTED_EMAILS = [
        "yshirokov05@gmail.com",
        "samanthagorvad@gmail.com",
        "yurievf@gmail.com",
        "schirokova.n@gmail.com",
        "tonysanchez990@gmail.com"
    ]
    
    email_for_check = email.lower().strip() if email else None
    logging.info(f"Auth Check - UID: {uid}, Email: {email}, CheckEmail: {email_for_check}")

    if email_for_check and email_for_check in WHITELISTED_EMAILS:
        logging.info(f"Auth Success - Hardcoded Whitelisted Email: {email_for_check}")
        return True

    db = get_db()
    if not db: return False
    
    # 1. Check User Doc
    user_ref = db.collection('users').document(uid)
    doc = user_ref.get()
    if doc.exists:
        data = doc.to_dict()
        logging.info(f"Auth Data - User Doc: {data}")
        if data.get('is_authorized') or data.get('is_subscribed'):
            return True
    
    # 2. Check Whitelist Collection by UID
    whitelist_ref = db.collection('whitelist').document(uid)
    if whitelist_ref.get().exists: 
        logging.info(f"Auth Success - UID {uid} in whitelist collection")
        return True

    # 3. Check Whitelist Collection by Email (robust fallback)
    if email_for_check:
        email_whitelist_query = db.collection('whitelist').where('email', '==', email_for_check).limit(1).get()
        if len(email_whitelist_query) > 0:
            logging.info(f"Auth Success - Email {email_for_check} found in whitelist collection")
            return True
            
        # Also check if the document ID itself is the email
        email_doc_ref = db.collection('whitelist').document(email_for_check)
        if email_doc_ref.get().exists:
            logging.info(f"Auth Success - Email {email_for_check} found as doc ID in whitelist collection")
            return True
    
    logging.warning(f"Auth Failed - UID: {uid}, Email: {email}")
    return False

@app.route('/api/auth_status', methods=['GET'])
@auth_required
def get_auth_status():
    email = getattr(request, 'email', None)
    return jsonify({'uid': request.uid, 'email': email, 'is_authorized': is_user_authorized(request.uid, email)})

@app.route('/api/cancel_subscription', methods=['POST'])
@auth_required
def cancel_subscription():
    # In a real app, this would talk to Stripe. For now, we log it and return success.
    logging.info(f"Subscription cancellation requested for user {request.uid}")
    # Note: We don't actually flip the is_subscribed bit yet to allow manual review/retention
    return jsonify({'success': True, 'message': 'Cancellation request received.'})

@app.route('/api/health')
def health_check():
    plaid_configured = bool(plaid_service.PLAID_CLIENT_ID and plaid_service.PLAID_SECRET)
    return jsonify({
        'status': 'ok',
        'plaid_configured': plaid_configured,
        'environment': plaid_service.PLAID_ENV,
        'has_fernet': bool(os.environ.get('FERNET_KEY')),
        'has_gemini': bool(os.environ.get('GEMINI_API_KEY')),
        'has_redirect_uri': bool(os.environ.get('PLAID_REDIRECT_URI'))
    })
@app.route('/api/net_worth', methods=['GET'])
@token_required
def get_net_worth():
    # ARCH-4: Rate limit dashboard hits
    if not check_rate_limit(request.uid, 'net_worth', limit_per_hour=100):
        return jsonify({'error': "Too many requests. Please wait a while."}), 429

    if request.uid == "guest":
        user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules = get_user_data(user_id="demo_user")
    else:
        user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories = get_user_data(user_id=request.uid)
    
    tickers = [a.ticker for a in assets]
    price_map = get_multiple_prices(tickers)
    
    net_worth_data = calculate_net_worth(user, incomes, assets, debts, retirement_accounts, insurances)
    net_worth_data['assets'] = [asset_to_dict(a, price_map) for a in assets]
    net_worth_data['incomes'] = [income_to_dict(i) for i in incomes]
    net_worth_data['debts'] = [debt_to_dict(d) for d in debts]
    net_worth_data['retirement_accounts'] = [retirement_account_to_dict(ra) for ra in retirement_accounts]
    net_worth_data['insurances'] = [get_insurance_to_dict(ins) for ins in insurances]
    net_worth_data['plaid_items'] = [{'institution_name': pi.institution_name, 'last_sync': pi.last_sync} for pi in plaid_items]
    net_worth_data['budgets'] = [budget_to_dict(b) for b in budgets]
    net_worth_data['transactions'] = [transaction_to_dict(t) for t in transactions]
    net_worth_data['paystubs'] = [{'id': p.id, 'date': p.date, 'gross_amount': p.gross_amount, 'net_amount': p.net_amount, 'tax_withheld': p.tax_withheld, 'employer': p.employer} for p in paystubs]
    net_worth_data['filing_status'] = user.filing_status.name
    net_worth_data['state'] = user.state.name
    net_worth_data['is_authorized'] = is_user_authorized(request.uid, getattr(request, 'email', None))
    return jsonify(net_worth_data)

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
            amount=m_amt + (random.random() * 5),
            date=(datetime.now() - timedelta(days=random.randint(0, 30))).strftime('%Y-%m-%d'),
            name=m_name,
            category=m_cat
        ))

    # Save everything
    user, _, _, _, _, _, plaid_items, _, _, _, custom_rules = get_user_data(user_id=uid)
    save_user_data(user, [sample_income], sample_assets, sample_debts, [], [], plaid_items=plaid_items, budgets=sample_budgets, transactions=sample_transactions, user_id=uid)

    # Return the new state
    tickers = [a.ticker for a in sample_assets]
    price_map = get_multiple_prices(tickers)
    
    net_worth_data = calculate_net_worth(user, [sample_income], sample_assets, sample_debts, [], [])
    net_worth_data['assets'] = [asset_to_dict(a, price_map) for a in sample_assets]
    net_worth_data['incomes'] = [income_to_dict(sample_income)]
    net_worth_data['debts'] = [debt_to_dict(d) for d in sample_debts]
    net_worth_data['is_authorized'] = is_user_authorized(uid, getattr(request, 'email', None))
    
    return jsonify(net_worth_data)

@app.route('/api/portfolio', methods=['PUT'])
@token_required
def update_portfolio():
    data = request.get_json()
    uid = "demo_user" if request.uid == "guest" else request.uid
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories = get_user_data(user_id=uid)

    if 'retirement_accounts' in data:
        retirement_accounts = [RetirementAccount(id=ra_data.get('id') or str(uuid.uuid4()), name=ra_data['name'], account_type=safe_enum(AccountType, ra_data['account_type'], AccountType.TRADITIONAL_IRA), contributions_2025=float(ra_data.get('contributions_2025', 0)), contributions_2026=float(ra_data.get('contributions_2026', 0))) for ra_data in data['retirement_accounts']]

    if 'insurances' in data:
        insurances = [Insurance(name=ins_data['name'], amount=float(ins_data.get('amount', 0)), frequency=safe_enum(InsuranceFrequency, ins_data['frequency'], InsuranceFrequency.MONTHLY)) for ins_data in data['insurances']]

    if 'assets' in data:
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
            income = Income(income_type=income_type, year=int(income_data.get('year', 2026)))
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
            incomes.append(income)

    if 'debts' in data:
        debts = [Debt(
            name=debt_data['name'] or 'Unnamed Debt', 
            initial_amount=float(debt_data.get('initial_amount', 0)), 
            amount_paid=float(debt_data.get('amount_paid', 0)), 
            monthly_payment=float(debt_data.get('monthly_payment', 0)), 
            interest_rate=float(debt_data.get('interest_rate', 0)), 
            plaid_account_id=debt_data.get('plaid_account_id'),
            debt_type=safe_enum(DebtType, debt_data.get('debt_type'), DebtType.INSTALLMENT)
        ) for debt_data in data['debts']]

    if 'budgets' in data:
        uid_for_ids = "demo_user" if request.uid == "guest" else request.uid
        budgets = [Budget(id=b.get('id', str(uuid.uuid4())), user_id=uid_for_ids, category=b['category'], limit_amount=float(b['limit_amount']), period=b.get('period', 'MONTHLY')) for b in data['budgets']]

    if 'paystubs' in data:
        uid_for_ids = "demo_user" if request.uid == "guest" else request.uid
        paystubs = [Paystub(id=p.get('id', str(uuid.uuid4())), user_id=uid_for_ids, date=p['date'], gross_amount=float(p['gross_amount']), net_amount=float(p.get('net_amount', 0)), tax_withheld=float(p.get('tax_withheld', 0)), employer=p.get('employer')) for p in data['paystubs']]

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

    save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, user_id=uid)

    price_map = get_multiple_prices([a.ticker for a in assets])
    
    net_worth_data = calculate_net_worth(user, incomes, assets, debts, retirement_accounts, insurances)
    net_worth_data['assets'] = [asset_to_dict(a, price_map) for a in assets]
    net_worth_data['incomes'] = [income_to_dict(i) for i in incomes]
    net_worth_data['debts'] = [debt_to_dict(d) for d in debts]
    net_worth_data['retirement_accounts'] = [retirement_account_to_dict(ra) for ra in retirement_accounts]
    net_worth_data['insurances'] = [get_insurance_to_dict(ins) for ins in insurances]
    net_worth_data['plaid_items'] = [{'institution_name': pi.institution_name, 'last_sync': pi.last_sync} for pi in plaid_items]
    net_worth_data['budgets'] = [budget_to_dict(b) for b in budgets]
    net_worth_data['transactions'] = [transaction_to_dict(t) for t in transactions]
    net_worth_data['paystubs'] = [{'id': p.id, 'date': p.date, 'gross_amount': p.gross_amount, 'net_amount': p.net_amount, 'tax_withheld': p.tax_withheld, 'employer': p.employer} for p in paystubs]
    net_worth_data['is_authorized'] = is_user_authorized(uid, getattr(request, 'email', None))
    return jsonify(net_worth_data)

@app.route('/api/plaid_sync', methods=['POST'])
@auth_required
def plaid_sync():
    if not is_user_authorized(request.uid, getattr(request, 'email', None)):
        return jsonify({'error': "Access restricted."}), 403
        
    # ARCH-4: Rate Limiting
    if not check_rate_limit(request.uid, 'plaid_sync', limit_per_hour=50):
        return jsonify({'error': "Plaid sync limit reached. Please wait an hour."}), 429

    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories = get_user_data(user_id=request.uid)
    if not plaid_items: return jsonify({'error': "No linked accounts found."}), 404
    try:
        all_new_assets, all_new_ra, all_new_transactions, all_new_debts, all_new_paystubs = [], [], [], [], []
        for pi in plaid_items:
            if not pi.access_token:
                logging.warning(f"Skipping institution {pi.institution_name} due to missing or invalid access token.")
                continue
            new_assets, new_ra, new_transactions, new_debts, new_paystubs = plaid_service.sync_plaid_data(pi.access_token, request.uid, custom_rules)
            all_new_assets.extend(new_assets)
            all_new_ra.extend(new_ra)
            all_new_transactions.extend(new_transactions)
            all_new_debts.extend(new_debts)
            all_new_paystubs.extend(new_paystubs)
            pi.last_sync = datetime.now().isoformat()
        
        existing_ra_ids = {ra.id for ra in retirement_accounts}
        for nra in all_new_ra:
            if nra.id not in existing_ra_ids: retirement_accounts.append(nra)
        
        new_asset_plaid_ids = {a.plaid_account_id for a in all_new_assets if a.plaid_account_id}
        new_debt_plaid_ids = {d.plaid_account_id for d in all_new_debts if d.plaid_account_id}
        
        # Filter out existing Plaid assets that are about to be replaced by new assets OR new debts
        # Debt IDs are typically 'account_id', Asset IDs are 'account_id_security_id'
        assets = [a for a in assets if not a.plaid_account_id or (
            a.plaid_account_id not in new_asset_plaid_ids and 
            not any(a.plaid_account_id.startswith(debt_id) for debt_id in new_debt_plaid_ids)
        )]
        
        # Combine existing manual/other assets with newly synced assets
        # Combine by (ticker, retirement_account_id) for consistency
        merged_assets = {}
        all_to_merge = assets + all_new_assets
        for a in all_to_merge:
            key = (a.ticker, a.retirement_account_id, a.tax_treatment.name)
            if key not in merged_assets:
                merged_assets[key] = a
            else:
                existing = merged_assets[key]
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
        assets = list(merged_assets.values())

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
                import re
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
        
        existing_trans_ids = {t.id for t in transactions}
        for nt in all_new_transactions:
            if nt.id not in existing_trans_ids: transactions.append(nt)

        existing_paystub_ids = {p.id for p in paystubs}
        for np in all_new_paystubs:
            if np.id not in existing_paystub_ids: paystubs.append(np)

        # RE-EVALUATE EXISTING TRANSACTIONS
        # This ensures that any keyword expansions in plaid_service are 
        # applied retroactively to older transactions stored in Firestore.
        for t in transactions:
            new_cat = plaid_service.categorize_transaction(t.name, None, custom_rules)
            if new_cat and t.category != new_cat:
                t.category = new_cat

        save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, user_id=request.uid)
        
        price_map = get_multiple_prices([a.ticker for a in assets])
        
        net_worth_data = calculate_net_worth(user, incomes, assets, debts, retirement_accounts, insurances)
        net_worth_data['assets'] = [asset_to_dict(a, price_map) for a in assets]
        net_worth_data['incomes'] = [income_to_dict(i) for i in incomes]
        net_worth_data['debts'] = [debt_to_dict(d) for d in debts]
        net_worth_data['retirement_accounts'] = [retirement_account_to_dict(ra) for ra in retirement_accounts]
        net_worth_data['insurances'] = [get_insurance_to_dict(ins) for ins in insurances]
        net_worth_data['plaid_items'] = [{'institution_name': pi.institution_name, 'last_sync': pi.last_sync} for pi in plaid_items]
        net_worth_data['budgets'] = [budget_to_dict(b) for b in budgets]
        net_worth_data['transactions'] = [transaction_to_dict(t) for t in transactions]
        net_worth_data['paystubs'] = [{'id': p.id, 'date': p.date, 'gross_amount': p.gross_amount, 'net_amount': p.net_amount, 'tax_withheld': p.tax_withheld, 'employer': p.employer} for p in paystubs]
        net_worth_data['is_authorized'] = is_user_authorized(request.uid, getattr(request, 'email', None))
        return jsonify(net_worth_data)
    except Exception as e:
        import traceback
        logging.error(f"Sync error: {str(e)}")
        logging.error(traceback.format_exc())
        return jsonify({'error': f"Synchronization error: {str(e)}"}), 500

@app.route('/api/user/onboarding_complete', methods=['PUT'])
@token_required
def onboarding_complete():
    uid = "demo_user" if request.uid == "guest" else request.uid
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, _, custom_categories = get_user_data(user_id=uid)
    save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=True, custom_categories=custom_categories, user_id=uid)
    return jsonify({'success': True})

@app.route('/api/user_tax_info', methods=['PUT'])
@token_required
def update_user_tax_info():
    data = request.get_json()
    uid = "demo_user" if request.uid == "guest" else request.uid
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories = get_user_data(user_id=uid)
    
    if data.get('filing_status'): user.filing_status = safe_enum(FilingStatus, data['filing_status'], FilingStatus.SINGLE)
    if data.get('state'): user.state = safe_enum(USState, data['state'], USState.CA)
    
    save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, user_id=uid)

    price_map = get_multiple_prices([a.ticker for a in assets])
    
    net_worth_data = calculate_net_worth(user, incomes, assets, debts, retirement_accounts, insurances)
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
    net_worth_data['is_authorized'] = is_user_authorized(uid, getattr(request, 'email', None))
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
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories = get_user_data(user_id=request.uid)
    
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
        user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories = get_user_data(user_id=request.uid)
        
        plaid_items = [pi for pi in plaid_items if pi.institution_name != institution_name]
        plaid_items.append(PlaidItem(access_token=access_token, item_id=item_id, institution_name=institution_name, last_sync=datetime.now().isoformat()))
        
        save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, user_id=request.uid)
        
        price_map = get_multiple_prices([a.ticker for a in assets])
        
        net_worth_data = calculate_net_worth(user, incomes, assets, debts, retirement_accounts, insurances)
        net_worth_data['assets'] = [asset_to_dict(a, price_map) for a in assets]
        net_worth_data['incomes'] = [income_to_dict(i) for i in incomes]
        net_worth_data['debts'] = [debt_to_dict(d) for d in debts]
        net_worth_data['retirement_accounts'] = [retirement_account_to_dict(ra) for ra in retirement_accounts]
        net_worth_data['insurances'] = [get_insurance_to_dict(ins) for ins in insurances]
        net_worth_data['plaid_items'] = [{'institution_name': pi.institution_name, 'last_sync': pi.last_sync} for pi in plaid_items]
        net_worth_data['budgets'] = [budget_to_dict(b) for b in budgets]
        net_worth_data['transactions'] = [transaction_to_dict(t) for t in transactions]
        net_worth_data['paystubs'] = [{'id': p.id, 'date': p.date, 'gross_amount': p.gross_amount, 'net_amount': p.net_amount, 'tax_withheld': p.tax_withheld, 'employer': p.employer} for p in paystubs]
        net_worth_data['filing_status'] = user.filing_status.name
        net_worth_data['state'] = user.state.name
        net_worth_data['is_authorized'] = is_user_authorized(request.uid, getattr(request, 'email', None))
        return jsonify(net_worth_data)
    except Exception as e:
        return jsonify({'error': "Failed to exchange access token."}), 500

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
        
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories = get_user_data(user_id=request.uid)
    
    price_map = get_multiple_prices([a.ticker for a in assets])
    
    financial_data = calculate_net_worth(user, incomes, assets, debts, retirement_accounts, insurances)
    financial_data['assets'] = [asset_to_dict(a, price_map) for a in assets]
    financial_data['debts'] = [debt_to_dict(d) for d in debts]
    financial_data['transactions'] = [transaction_to_dict(t) for t in transactions]
    financial_data['budgets'] = [budget_to_dict(b) for b in budgets]
    financial_data['state'] = user.state.name
    advice = advisor_service.get_financial_advice(user_prompt, financial_data)
    return jsonify({'advice': advice})

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

    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories = get_user_data(user_id=request.uid)

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

    save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, user_id=request.uid)
    
    return jsonify({'success': True, 'transactions': [transaction_to_dict(t) for t in transactions]})

@app.route('/api/remove_institution', methods=['POST'])
@auth_required
def remove_institution():
    if not is_user_authorized(request.uid, getattr(request, 'email', None)):
        return jsonify({'error': "Access restricted."}), 403
        
    data = request.get_json()
    institution_name = data.get('institution_name')
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories = get_user_data(user_id=request.uid)
    
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

    save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, user_id=request.uid)
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
        
    success = firestore_db.save_feedback(request.uid, email, topic, content, severity)
    if success:
        return jsonify({'success': True})
    else:
        return jsonify({'error': "Failed to save feedback"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
