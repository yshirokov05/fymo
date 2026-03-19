from datetime import datetime
from typing import Optional, List, Dict
from firebase_admin import credentials, firestore
from models import User, Income, Asset, Debt, FilingStatus, USState, IncomeType, AssetType, RetirementAccount, AccountType, Insurance, InsuranceFrequency, HourlyType, PlaidItem, Budget, Transaction, Paystub, CustomRule, TaxTreatment, DebtType
import logging
import os
import firebase_admin
from cryptography.fernet import Fernet

# SEC-2: Encryption for Plaid tokens at rest
# In production, set FERNET_KEY in your environment/Secret Manager
_FERNET_KEY = os.environ.get('FERNET_KEY')
if not _FERNET_KEY:
    logging.critical("CRITICAL: FERNET_KEY not set in environment! Encryption/Decryption will fail.")
    # We do NOT generate a new key here, as it would make existing data unreadable.
    _cipher_suite = None
else:
    _cipher_suite = Fernet(_FERNET_KEY.encode())

def encrypt_token(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
        
    suite = _cipher_suite
    if not suite:
        logging.error("Cannot encrypt: FERNET_KEY missing.")
        return None
        
    return suite.encrypt(token.encode()).decode()

def decrypt_token(encrypted_token: Optional[str]) -> Optional[str]:
    if not encrypted_token:
        return None
        
    suite = _cipher_suite
    if not suite:
        logging.error("Cannot decrypt: FERNET_KEY missing.")
        return None
        
    try:
        return suite.decrypt(encrypted_token.encode()).decode()
    except Exception as e:
        logging.error(f"Failed to decrypt token: {e}. This usually means FERNET_KEY has changed.")
        return None

def get_db():
    try:
        app = firebase_admin.get_app()
    except ValueError:
        try:
            app = firebase_admin.initialize_app()
        except Exception as e:
            logging.error(f"Failed to initialize Firebase: {e}")
            return None
    try:
        return firestore.client()
    except Exception as e:
        logging.error(f"Failed to create Firestore client: {e}")
        return None

def safe_enum(enum_class, value, default):
    try:
        if not value: return default
        if isinstance(value, enum_class): return value
        if value in enum_class.__members__:
            return enum_class[value]
        for member in enum_class:
            if member.value == value:
                return member
        return default
    except (KeyError, ValueError, TypeError):
        return default

def get_user_data(user_id="default_user"):
    """Fetches user financial state with robust error handling and subcollection support."""
    db = get_db()
    if db is None:
        return User(filing_status=FilingStatus.SINGLE, state=USState.CA), [], [], [], [], [], [], [], [], [], [], False, []
    
    user_ref = db.collection('users').document(user_id)
    doc = user_ref.get()
    
    if not doc.exists:
        logging.info(f"User document {user_id} not found.")
        return User(filing_status=FilingStatus.SINGLE, state=USState.CA), [], [], [], [], [], [], [], [], [], [], False, []
    
    data = doc.to_dict()
    
    user = User(
        filing_status=safe_enum(FilingStatus, data.get('filing_status'), FilingStatus.SINGLE),
        state=safe_enum(USState, data.get('state'), USState.CA),
        is_authorized=data.get('is_authorized', False),
        is_subscribed=data.get('is_subscribed', False),
        has_completed_onboarding=data.get('has_completed_onboarding', False),
        custom_categories=data.get('custom_categories', [])
    )
    
    incomes = [Income(income_type=safe_enum(IncomeType, inc.get('income_type'), IncomeType.ANNUAL_SALARY), hourly_type=safe_enum(HourlyType, inc.get('hourly_type'), HourlyType.REPEATING), amount=inc['amount'], monthly_income=inc.get('monthly_income'), hourly_wage=inc.get('hourly_wage'), hours_worked=inc.get('hours_worked'), year=inc.get('year', 2026)) for inc in data.get('incomes', [])]
    assets = [Asset(
        ticker=ass['ticker'], 
        shares=ass['shares'], 
        cost_basis=ass['cost_basis'], 
        total_gain=ass.get('total_gain'),
        asset_type=safe_enum(AssetType, ass.get('asset_type'), AssetType.STOCK), 
        retirement_account_id=ass.get('retirement_account_id'), 
        plaid_account_id=ass.get('plaid_account_id'),
        institution_name=ass.get('institution_name'),
        last_price_update=ass.get('last_price_update'),
        tax_treatment=safe_enum(TaxTreatment, ass.get('tax_treatment'), TaxTreatment.TAXABLE)
    ) for ass in data.get('assets', [])]
    debts = [Debt(
        name=dbt['name'], 
        initial_amount=dbt['initial_amount'], 
        amount_paid=dbt['amount_paid'], 
        monthly_payment=dbt.get('monthly_payment'), 
        interest_rate=dbt.get('interest_rate'), 
        plaid_account_id=dbt.get('plaid_account_id'),
        institution_name=dbt.get('institution_name'),
        official_name=dbt.get('official_name'),
        debt_type=safe_enum(DebtType, dbt.get('debt_type'), DebtType.INSTALLMENT)
    ) for dbt in data.get('debts', [])]
    retirement_accounts = [RetirementAccount(id=ra.get('id'), name=ra['name'], account_type=safe_enum(AccountType, ra.get('account_type'), AccountType.TRADITIONAL_IRA), contributions_2025=ra.get('contributions_2025', 0.0), contributions_2026=ra.get('contributions_2026', 0.0)) for ra in data.get('retirement_accounts', [])]
    insurances = [Insurance(name=ins['name'], amount=ins['amount'], frequency=safe_enum(InsuranceFrequency, ins.get('frequency'), InsuranceFrequency.MONTHLY)) for ins in data.get('insurances', [])]
    
    plaid_items = []
    for pi in data.get('plaid_items', []):
        # SEC-2: Decrypt token on fetch
        raw_token = pi['access_token']
        # If it's already encrypted (Fernet tokens start with gAAAA), decrypt it.
        # This handles the transition from plaintext to encrypted.
        if raw_token and raw_token.startswith('gAAAA'):
            decrypted = decrypt_token(raw_token)
        else:
            decrypted = raw_token # Transition phase: treat as plaintext
            
        plaid_items.append(PlaidItem(
            access_token=decrypted,
            item_id=pi['item_id'],
            institution_name=pi.get('institution_name'),
            last_sync=pi.get('last_sync')
        ))

    budgets = [Budget(id=b.get('id'), user_id=user_id, category=b['category'], limit_amount=b['limit_amount'], period=b.get('period', 'MONTHLY')) for b in data.get('budgets', [])]
    
    transactions = []
    for t in data.get('transactions', []):
        transactions.append(Transaction(id=t['id'], user_id=user_id, account_id=t.get('account_id'), amount=t['amount'], date=t['date'], name=t['name'], category=t.get('category'), pending=t.get('pending', False)))
    
    sub_txns = user_ref.collection('transactions').order_by('date', direction=firestore.Query.DESCENDING).limit(500).get()
    existing_ids = {t.id for t in transactions}
    for doc in sub_txns:
        if doc.id not in existing_ids:
            t = doc.to_dict()
            transactions.append(Transaction(id=doc.id, user_id=user_id, account_id=t.get('account_id'), amount=t['amount'], date=t['date'], name=t['name'], category=t.get('category'), pending=t.get('pending', False)))

    paystubs = []
    for p in data.get('paystubs', []):
        paystubs.append(Paystub(id=p['id'], user_id=user_id, date=p['date'], gross_amount=p['gross_amount'], net_amount=p.get('net_amount'), tax_withheld=p.get('tax_withheld'), employer=p.get('employer')))
    
    sub_paystubs = user_ref.collection('paystubs').order_by('date', direction=firestore.Query.DESCENDING).get()
    existing_p_ids = {p.id for p in paystubs}
    for doc in sub_paystubs:
        if doc.id not in existing_p_ids:
            p = doc.to_dict()
            paystubs.append(Paystub(id=doc.id, user_id=user_id, date=p['date'], gross_amount=p['gross_amount'], net_amount=p.get('net_amount'), tax_withheld=p.get('tax_withheld'), employer=p.get('employer')))
            
    # Load Custom Rules
    custom_rules_raw = data.get('custom_rules', [])
    custom_rules = [CustomRule(id=cr.get('id'), user_id=user_id, merchant_name=cr['merchant_name'], category=cr['category']) for cr in custom_rules_raw]
    
    sub_rules = user_ref.collection('custom_rules').get()
    existing_r_ids = {r.id for r in custom_rules}
    for doc in sub_rules:
        if doc.id not in existing_r_ids:
            r = doc.to_dict()
            custom_rules.append(CustomRule(id=doc.id, user_id=user_id, merchant_name=r['merchant_name'], category=r['category']))

    # Sort descending by date so the newest items are returned first
    transactions.sort(key=lambda t: t.date, reverse=True)
    paystubs.sort(key=lambda p: p.date, reverse=True)
        
    return user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, user.has_completed_onboarding, user.custom_categories

def save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, 
                   plaid_items=None, budgets=None, transactions=None, paystubs=None, custom_rules=None, 
                   has_completed_onboarding=None, custom_categories=None, user_id="default_user"):
    """Saves state to Firestore using subcollections for transactions/paystubs and encrypting Plaid tokens."""
    if plaid_items is None: plaid_items = []
    if budgets is None: budgets = []
    if transactions is None: transactions = []
    if paystubs is None: paystubs = []
    if custom_rules is None: custom_rules = []
    
    db = get_db()
    if db is None: return
    user_ref = db.collection('users').document(user_id)
    
    batch = db.batch()
    for t in transactions:
        t_ref = user_ref.collection('transactions').document(t.id)
        batch.set(t_ref, {
            'account_id': t.account_id,
            'amount': t.amount,
            'date': t.date,
            'name': t.name,
            'category': t.category,
            'pending': t.pending
        })
    
    for p in paystubs:
        p_ref = user_ref.collection('paystubs').document(p.id)
        batch.set(p_ref, {
            'date': p.date,
            'gross_amount': p.gross_amount,
            'net_amount': p.net_amount,
            'tax_withheld': p.tax_withheld,
            'employer': p.employer
        })
        
    for r in custom_rules:
        r_ref = user_ref.collection('custom_rules').document(r.id)
        batch.set(r_ref, {
            'merchant_name': r.merchant_name,
            'category': r.category
        })
    
    batch.commit()
    
    transactions.sort(key=lambda t: t.date, reverse=True)
    paystubs.sort(key=lambda p: p.date, reverse=True)
    
    data = {
        'filing_status': user.filing_status.name,
        'state': user.state.name,
        'incomes': [{'income_type': i.income_type.name, 'hourly_type': i.hourly_type.name if i.hourly_type else 'REPEATING', 'amount': i.amount, 'monthly_income': i.monthly_income, 'hourly_wage': i.hourly_wage, 'hours_worked': i.hours_worked, 'year': i.year} for i in incomes],
        'assets': [{
            'ticker': a.ticker, 
            'shares': a.shares, 
            'cost_basis': a.cost_basis, 
            'total_gain': getattr(a, 'total_gain', None),
            'asset_type': a.asset_type.name, 
            'retirement_account_id': getattr(a, 'retirement_account_id', None), 
            'plaid_account_id': getattr(a, 'plaid_account_id', None),
            'institution_name': getattr(a, 'institution_name', None),
            'last_price_update': getattr(a, 'last_price_update', None),
            'tax_treatment': a.tax_treatment.name
        } for a in assets],
        'debts': [{
            'name': d.name, 
            'initial_amount': d.initial_amount, 
            'amount_paid': d.amount_paid, 
            'monthly_payment': d.monthly_payment, 
            'interest_rate': d.interest_rate, 
            'plaid_account_id': d.plaid_account_id,
            'institution_name': d.institution_name,
            'official_name': d.official_name,
            'debt_type': d.debt_type.name
        } for d in debts],
        'retirement_accounts': [{'id': r.id, 'name': r.name, 'account_type': r.account_type.name, 'contributions_2025': r.contributions_2025, 'contributions_2026': r.contributions_2026} for r in retirement_accounts],
        'insurances': [{'name': ins.name, 'amount': ins.amount, 'frequency': ins.frequency.name} for ins in insurances],
        # SEC-2: Encrypt Plaid tokens on save
        'plaid_items': [{'access_token': encrypt_token(pi.access_token), 'item_id': pi.item_id, 'institution_name': pi.institution_name, 'last_sync': pi.last_sync} for pi in (plaid_items or [])],
        'budgets': [{'id': b.id, 'category': b.category, 'limit_amount': b.limit_amount, 'period': b.period} for b in (budgets or [])],
        'transactions': [{'id': t.id, 'account_id': t.account_id, 'amount': t.amount, 'date': t.date, 'name': t.name, 'category': t.category, 'pending': t.pending} for t in (transactions[:50] if transactions else [])],
        'paystubs': [{'id': p.id, 'date': p.date, 'gross_amount': p.gross_amount, 'net_amount': p.net_amount, 'tax_withheld': p.tax_withheld, 'employer': p.employer} for p in (paystubs[:10] if paystubs else [])],
        'custom_rules': [{'id': r.id, 'merchant_name': r.merchant_name, 'category': r.category} for r in (custom_rules or [])],
        'has_completed_onboarding': has_completed_onboarding if has_completed_onboarding is not None else user.has_completed_onboarding,
        'custom_categories': custom_categories if custom_categories is not None else user.custom_categories
    }
    user_ref.set(data, merge=True)
    logging.info(f"Successfully saved encrypted state for {user_id}")

def wipe_user_subcollections(user_id):
    """Deletes all documents in transactions and paystubs subcollections for a user."""
    db = get_db()
    if not db: return
    user_ref = db.collection('users').document(user_id)
    
    # Wipe Transactions
    txns = user_ref.collection('transactions').limit(500).get()
    while len(txns) > 0:
        batch = db.batch()
        for doc in txns:
            batch.delete(doc.reference)
        batch.commit()
        txns = user_ref.collection('transactions').limit(500).get()
        
    # Wipe Paystubs
    stubs = user_ref.collection('paystubs').limit(500).get()
    while len(stubs) > 0:
        batch = db.batch()
        for doc in stubs:
            batch.delete(doc.reference)
        batch.commit()
        stubs = user_ref.collection('paystubs').limit(500).get()
    
    logging.info(f"Wiped subcollections for user {user_id}")


def save_feedback(user_id, email, topic, content, severity):
    """Saves user feedback to a dedicated collection."""
    db = get_db()
    if not db: return False
    
    try:
        feedback_ref = db.collection('feedback').document()
        feedback_ref.set({
            'user_id': user_id,
            'email': email,
            'topic': topic,
            'content': content,
            'severity': severity,
            'timestamp': datetime.now().isoformat()
        })
        logging.info(f"Feedback saved from {user_id}")
        return True
    except Exception as e:
        logging.error(f"Failed to save feedback: {e}")
        return False
