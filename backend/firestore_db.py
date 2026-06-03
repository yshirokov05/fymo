from datetime import datetime
from typing import Optional, List, Dict
from dataclasses import dataclass, field
from firebase_admin import credentials, firestore
from models import User, Income, Asset, Debt, FilingStatus, USState, IncomeType, AssetType, RetirementAccount, AccountType, Insurance, InsuranceFrequency, HourlyType, PlaidItem, Budget, Transaction, Paystub, CustomRule, TaxTreatment, DebtType, CheckStatus, OutstandingCheck
import logging
import os
import firebase_admin
from cryptography.fernet import Fernet
import uuid


@dataclass
class UserData:
    """
    Container for a user's full financial state loaded from Firestore.

    Backwards-compatible with the legacy 15-tuple unpacking pattern via __iter__,
    so existing call sites like:
        user, incomes, assets, debts, ... = get_user_data(uid)
    continue to work unchanged.

    New code should prefer attribute access:
        ud = get_user_data(uid)
        ud.assets, ud.debts, ud.transactions

    FIELD ORDER IS LOAD-BEARING — the legacy tuple unpacking depends on it.
    Do NOT reorder fields. Add new fields at the END only.
    """
    user: object = None
    incomes: list = field(default_factory=list)
    assets: list = field(default_factory=list)
    debts: list = field(default_factory=list)
    retirement_accounts: list = field(default_factory=list)
    insurances: list = field(default_factory=list)
    plaid_items: list = field(default_factory=list)
    budgets: list = field(default_factory=list)
    transactions: list = field(default_factory=list)
    paystubs: list = field(default_factory=list)
    custom_rules: list = field(default_factory=list)
    has_completed_onboarding: bool = False
    custom_categories: list = field(default_factory=list)
    outstanding_checks: list = field(default_factory=list)
    ignored_flexible: list = field(default_factory=list)

    # Tuple of (attribute names) in legacy unpacking order — single source of truth.
    _LEGACY_ORDER = (
        'user', 'incomes', 'assets', 'debts', 'retirement_accounts', 'insurances',
        'plaid_items', 'budgets', 'transactions', 'paystubs', 'custom_rules',
        'has_completed_onboarding', 'custom_categories', 'outstanding_checks', 'ignored_flexible',
    )

    def __iter__(self):
        # Enables: user, incomes, assets, ... = get_user_data(uid)
        # Yields ATTRIBUTE REFERENCES (not copies), so callers can mutate lists in place.
        return (getattr(self, name) for name in self._LEGACY_ORDER)

    def __len__(self):
        return len(self._LEGACY_ORDER)

    def __getitem__(self, idx):
        return getattr(self, self._LEGACY_ORDER[idx])


def _empty_user_data():
    """Default UserData instance for missing/error cases."""
    return UserData(user=User(filing_status=FilingStatus.SINGLE, state=USState.CA))


class ConcurrentModificationError(Exception):
    """
    Raised by save_user_data when the user document changed since the caller
    read it (optimistic concurrency control). Lets the API return 409 Conflict
    instead of silently overwriting a concurrent edit — the core fix for the
    "I edited my assets and they vanished" data-loss class.
    """
    def __init__(self, current_rev=None, expected_rev=None):
        self.current_rev = current_rev
        self.expected_rev = expected_rev
        super().__init__(
            f"Concurrent modification: stored rev {current_rev} != expected {expected_rev}"
        )

# SEC-2: Encryption for Plaid tokens at rest
# In production, set FERNET_KEY in your environment/Secret Manager
# Deep sanitise to remove any internal or trailing newlines (\n or \r)
_RAW_FERNET_KEY = os.environ.get('FERNET_KEY', '')
_FERNET_KEY = _RAW_FERNET_KEY.replace('\n', '').replace('\r', '').strip()

if not _FERNET_KEY:
    logging.critical("CRITICAL: FERNET_KEY not set in environment! Encryption/Decryption will fail.")
    _cipher_suite = None
else:
    try:
        _cipher_suite = Fernet(_FERNET_KEY.encode())
    except Exception as e:
        logging.critical(f"CRITICAL: Failed to initialize Fernet with provided key: {e}. Encryption will be disabled.")
        _cipher_suite = None

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

def get_user_data(user_id="default_user", fields=None):
    """
    Fetches user financial state with robust error handling and subcollection support.

    Returns a UserData dataclass instance. Supports legacy tuple unpacking via __iter__:
        user, incomes, assets, debts, ... = get_user_data(uid)  # still works
        ud = get_user_data(uid); ud.assets                       # preferred for new code
    """
    db = get_db()
    if db is None:
        return _empty_user_data()

    user_ref = db.collection('users').document(user_id)
    doc = user_ref.get()

    if not doc.exists:
        logging.info(f"User document {user_id} not found.")
        return _empty_user_data()
    
    data = doc.to_dict()
    
    user = User(
        filing_status=safe_enum(FilingStatus, data.get('filing_status'), FilingStatus.SINGLE),
        state=safe_enum(USState, data.get('state'), USState.CA),
        is_authorized=data.get('is_authorized', False),
        is_subscribed=data.get('is_subscribed', False),
        has_completed_onboarding=data.get('has_completed_onboarding', False),
        custom_categories=data.get('custom_categories', []),
        ignored_subscription_merchants=data.get('ignored_subscription_merchants', []),
        manual_subscription_merchants=data.get('manual_subscription_merchants', []),
        ignored_flexible=data.get('ignored_flexible', []),
        excluded_paystub_ids=data.get('excluded_paystub_ids', []),
        excluded_paystub_employers=data.get('excluded_paystub_employers', []),
        stripe_customer_id=data.get('stripe_customer_id'),
        stripe_subscription_id=data.get('stripe_subscription_id')
    )
    
    user.investment_history = data.get('investment_history')
    # Optimistic-concurrency version. Stashed on the user object (like
    # investment_history) so callers that tuple-unpack still get it via `user.rev`.
    user.rev = data.get('rev', 0) or 0

    custom_categories = data.get('custom_categories', [])
    ignored_flexible = data.get('ignored_flexible', [])
    
    incomes = [
        Income(
            income_type=safe_enum(IncomeType, inc.get('income_type'), IncomeType.ANNUAL_SALARY), 
            hourly_type=safe_enum(HourlyType, inc.get('hourly_type'), HourlyType.REPEATING), 
            amount=inc.get('amount', 0),
            monthly_income=inc.get('monthly_income'), 
            hourly_wage=inc.get('hourly_wage'), 
            hours_worked=inc.get('hours_worked'), 
            year=inc.get('year', 2026),
            description=inc.get('description'),
            is_net=inc.get('is_net', False)
        ) for inc in data.get('incomes', [])
    ]
    assets = [Asset(
        ticker=ass.get('ticker', ''),
        shares=ass.get('shares', 0),
        cost_basis=ass.get('cost_basis', 0.0),
        total_gain=ass.get('total_gain'),
        asset_type=safe_enum(AssetType, ass.get('asset_type'), AssetType.STOCK), 
        retirement_account_id=ass.get('retirement_account_id'), 
        plaid_account_id=ass.get('plaid_account_id'),
        institution_name=ass.get('institution_name'),
        last_price_update=ass.get('last_price_update'),
        tax_treatment=safe_enum(TaxTreatment, ass.get('tax_treatment'), TaxTreatment.TAXABLE)
    ) for ass in data.get('assets', [])]
    debts = [Debt(
        name=dbt.get('name', 'Unnamed Debt'),
        initial_amount=dbt.get('initial_amount', 0),
        amount_paid=dbt.get('amount_paid', 0),
        monthly_payment=dbt.get('monthly_payment'), 
        interest_rate=dbt.get('interest_rate'), 
        plaid_account_id=dbt.get('plaid_account_id'),
        institution_name=dbt.get('institution_name'),
        official_name=dbt.get('official_name'),
        debt_type=safe_enum(DebtType, dbt.get('debt_type'), DebtType.INSTALLMENT)
    ) for dbt in data.get('debts', [])]
    retirement_accounts = [RetirementAccount(id=ra.get('id'), name=ra['name'], account_type=safe_enum(AccountType, ra.get('account_type'), AccountType.TRADITIONAL_IRA), contributions_2025=ra.get('contributions_2025', 0.0), contributions_2026=ra.get('contributions_2026', 0.0)) for ra in data.get('retirement_accounts', [])]
    insurances = [
        Insurance(
            name=ins['name'], 
            amount=ins['amount'], 
            frequency=safe_enum(InsuranceFrequency, ins.get('frequency'), InsuranceFrequency.MONTHLY),
            insurance_type=ins.get('insurance_type', 'Auto'),
            deductible=float(ins.get('deductible', 0.0)),
            coverage_summary=ins.get('coverage_summary'),
            advisor_observations=ins.get('advisor_observations'),
            last_audit_date=ins.get('last_audit_date', datetime.now().isoformat())
        ) for ins in data.get('insurances', [])
    ]
    
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
    if not fields or 'transactions' in fields:
        for t in data.get('transactions', []):
            transactions.append(Transaction(id=t['id'], user_id=user_id, account_id=t.get('account_id'), amount=t['amount'], date=t['date'], name=t['name'], category=t.get('category'), pending=t.get('pending', False), pending_transaction_id=t.get('pending_transaction_id')))
        
        sub_txns = user_ref.collection('transactions').order_by('date', direction=firestore.Query.DESCENDING).limit(500).get()
        existing_ids = {t.id for t in transactions}
        for doc in sub_txns:
            if doc.id not in existing_ids:
                t = doc.to_dict()
                transactions.append(Transaction(id=doc.id, user_id=user_id, account_id=t.get('account_id'), amount=t['amount'], date=t['date'], name=t['name'], category=t.get('category'), pending=t.get('pending', False), pending_transaction_id=t.get('pending_transaction_id')))
        transactions.sort(key=lambda t: t.date, reverse=True)

    paystubs = []
    if not fields or 'paystubs' in fields:
        for p in data.get('paystubs', []):
            paystubs.append(Paystub(id=p['id'], user_id=user_id, date=p['date'], gross_amount=p['gross_amount'], net_amount=p.get('net_amount'), tax_withheld=p.get('tax_withheld'), employer=p.get('employer'), is_net_primary=p.get('is_net_primary', False), subject_to_fica=p.get('subject_to_fica', True)))

        sub_paystubs = user_ref.collection('paystubs').order_by('date', direction=firestore.Query.DESCENDING).get()
        existing_p_ids = {p.id for p in paystubs}
        for doc in sub_paystubs:
            if doc.id not in existing_p_ids:
                p = doc.to_dict()
                paystubs.append(Paystub(id=doc.id, user_id=user_id, date=p['date'], gross_amount=p['gross_amount'], net_amount=p.get('net_amount'), tax_withheld=p.get('tax_withheld'), employer=p.get('employer'), is_net_primary=p.get('is_net_primary', False), subject_to_fica=p.get('subject_to_fica', True)))
        paystubs.sort(key=lambda p: p.date, reverse=True)
            
    custom_rules = []
    if not fields or 'custom_rules' in fields:
        custom_rules_raw = data.get('custom_rules', [])
        custom_rules = [CustomRule(id=cr.get('id'), user_id=user_id, merchant_name=cr['merchant_name'], category=cr['category']) for cr in custom_rules_raw]
        
        sub_rules = user_ref.collection('custom_rules').get()
        existing_r_ids = {r.id for r in custom_rules}
        for doc in sub_rules:
            if doc.id not in existing_r_ids:
                r = doc.to_dict()
                custom_rules.append(CustomRule(id=doc.id, user_id=user_id, merchant_name=r['merchant_name'], category=r['category']))

    outstanding_checks = []
    if not fields or 'outstanding_checks' in fields:
        for c in data.get('outstanding_checks', []):
            outstanding_checks.append(OutstandingCheck(id=c.get('id', str(uuid.uuid4())), user_id=user_id, amount=c.get('amount', 0), payee=c.get('payee', ''), date_written=c.get('date_written', ''), status=safe_enum(CheckStatus, c.get('status'), CheckStatus.PENDING), plaid_transaction_id=c.get('plaid_transaction_id')))
            
        sub_checks = user_ref.collection('outstanding_checks').order_by('date_written', direction=firestore.Query.DESCENDING).get()
        existing_c_ids = {c.id for c in outstanding_checks}
        for doc in sub_checks:
            if doc.id not in existing_c_ids:
                c = doc.to_dict()
                outstanding_checks.append(OutstandingCheck(id=doc.id, user_id=user_id, amount=c['amount'], payee=c['payee'], date_written=c['date_written'], status=safe_enum(CheckStatus, c.get('status'), CheckStatus.PENDING), plaid_transaction_id=c.get('plaid_transaction_id')))
        outstanding_checks.sort(key=lambda c: c.date_written, reverse=True)
        
    return UserData(
        user=user,
        incomes=incomes,
        assets=assets,
        debts=debts,
        retirement_accounts=retirement_accounts,
        insurances=insurances,
        plaid_items=plaid_items,
        budgets=budgets,
        transactions=transactions,
        paystubs=paystubs,
        custom_rules=custom_rules,
        has_completed_onboarding=user.has_completed_onboarding,
        custom_categories=custom_categories,
        outstanding_checks=outstanding_checks,
        ignored_flexible=ignored_flexible,
    )

def save_user_data(user, incomes, assets, debts, retirement_accounts, insurances,
                   plaid_items=None, budgets=None, transactions=None, paystubs=None, custom_rules=None,
                   has_completed_onboarding=None, custom_categories=None, outstanding_checks=None,
                   ignored_flexible=None, user_id="default_user", expected_rev=None):
    """Saves state to Firestore using subcollections for transactions/paystubs and encrypting Plaid tokens.

    Concurrency: the top-level user document (which holds assets, debts, incomes,
    budgets, etc.) is written inside a Firestore transaction that bumps a `rev`
    counter. When `expected_rev` is provided, the write is rejected with
    ConcurrentModificationError if the stored rev no longer matches — i.e. another
    writer (a second browser tab, or a Plaid sync) committed since the caller read
    the data. This prevents silent last-writer-wins clobbering of user edits.
    Callers that don't pass expected_rev get an atomic last-writer-wins write that
    still bumps rev (so interactive callers can detect the change). Returns new rev.
    """
    if plaid_items is None: plaid_items = []
    if budgets is None: budgets = []
    if transactions is None: transactions = []
    if paystubs is None: paystubs = []
    if custom_rules is None: custom_rules = []
    if outstanding_checks is None: outstanding_checks = []
    if ignored_flexible is None: ignored_flexible = getattr(user, 'ignored_flexible', [])
    
    db = get_db()
    if db is None: return
    user_ref = db.collection('users').document(user_id)
    
    def commit_batch(current_batch, count):
        if count > 0:
            current_batch.commit()
            return db.batch(), 0
        return current_batch, count

    batch = db.batch()
    op_count = 0
    
    # 1. Transactions subcollection
    for t in transactions:
        t_ref = user_ref.collection('transactions').document(t.id)
        batch.set(t_ref, {
            'account_id': t.account_id,
            'amount': t.amount,
            'date': t.date,
            'name': t.name,
            'category': t.category,
            'pending': t.pending,
            'pending_transaction_id': getattr(t, 'pending_transaction_id', None)
        })
        op_count += 1
        if op_count >= 450:
            batch, op_count = commit_batch(batch, op_count)
    
    # 2. Paystubs subcollection
    for p in paystubs:
        p_ref = user_ref.collection('paystubs').document(p.id)
        batch.set(p_ref, {
            'date': p.date,
            'gross_amount': p.gross_amount,
            'net_amount': p.net_amount,
            'tax_withheld': p.tax_withheld,
            'employer': p.employer,
            'is_net_primary': p.is_net_primary,
            'subject_to_fica': getattr(p, 'subject_to_fica', True),
        })
        op_count += 1
        if op_count >= 450:
            batch, op_count = commit_batch(batch, op_count)
            
    # 3. Custom Rules subcollection
    for r in custom_rules:
        r_ref = user_ref.collection('custom_rules').document(r.id)
        batch.set(r_ref, {
            'merchant_name': r.merchant_name,
            'category': r.category
        })
        op_count += 1
        if op_count >= 450:
            batch, op_count = commit_batch(batch, op_count)
            
    # 4. Outstanding Checks subcollection
    for c in outstanding_checks:
        c_ref = user_ref.collection('outstanding_checks').document(c.id)
        batch.set(c_ref, {
            'amount': c.amount,
            'payee': c.payee,
            'date_written': c.date_written,
            'status': c.status.name,
            'plaid_transaction_id': c.plaid_transaction_id
        })
        op_count += 1
        if op_count >= 450:
            batch, op_count = commit_batch(batch, op_count)
    
    # Final commit for remaining operations
    if op_count > 0:
        batch.commit()
    
    transactions.sort(key=lambda t: t.date, reverse=True)
    paystubs.sort(key=lambda p: p.date, reverse=True)
    
    data = {
        'filing_status': user.filing_status.name,
        'state': user.state.name,
        'incomes': [
            {
                'income_type': i.income_type.name, 
                'hourly_type': i.hourly_type.name if i.hourly_type else 'REPEATING', 
                'amount': i.amount, 
                'monthly_income': i.monthly_income, 
                'hourly_wage': i.hourly_wage, 
                'hours_worked': i.hours_worked, 
                'year': i.year,
                'description': i.description,
                'is_net': getattr(i, 'is_net', False)
            } for i in incomes
        ],
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
        'insurances': [
            {
                'name': ins.name, 
                'amount': ins.amount, 
                'frequency': ins.frequency.name,
                'insurance_type': ins.insurance_type,
                'deductible': ins.deductible,
                'coverage_summary': ins.coverage_summary,
                'advisor_observations': ins.advisor_observations,
                'last_audit_date': ins.last_audit_date
            } for ins in insurances
        ],
        # SEC-2: Encrypt Plaid tokens on save
        'plaid_items': [{'access_token': encrypt_token(pi.access_token), 'item_id': pi.item_id, 'institution_name': pi.institution_name, 'last_sync': pi.last_sync} for pi in (plaid_items or [])],
        'budgets': [{'id': b.id, 'category': b.category, 'limit_amount': b.limit_amount, 'period': b.period} for b in (budgets or [])],
        'transactions': [{'id': t.id, 'account_id': t.account_id, 'amount': t.amount, 'date': t.date, 'name': t.name, 'category': t.category, 'pending': t.pending, 'pending_transaction_id': getattr(t, 'pending_transaction_id', None)} for t in (transactions[:50] if transactions else [])],
        'paystubs': [{'id': p.id, 'date': p.date, 'gross_amount': p.gross_amount, 'net_amount': p.net_amount, 'tax_withheld': p.tax_withheld, 'employer': p.employer, 'is_net_primary': p.is_net_primary, 'subject_to_fica': getattr(p, 'subject_to_fica', True)} for p in (paystubs[:10] if paystubs else [])],
        'custom_rules': [{'id': r.id, 'merchant_name': r.merchant_name, 'category': r.category} for r in (custom_rules or [])],
        'outstanding_checks': [{'id': c.id, 'amount': c.amount, 'payee': c.payee, 'date_written': c.date_written, 'status': c.status.name, 'plaid_transaction_id': c.plaid_transaction_id} for c in (outstanding_checks[:20] if outstanding_checks else [])],
        'has_completed_onboarding': has_completed_onboarding if has_completed_onboarding is not None else user.has_completed_onboarding,
        'custom_categories': custom_categories if custom_categories is not None else user.custom_categories,
        'ignored_subscription_merchants': getattr(user, 'ignored_subscription_merchants', []),
        'manual_subscription_merchants': getattr(user, 'manual_subscription_merchants', []),
        'ignored_flexible': ignored_flexible,
        'excluded_paystub_ids': getattr(user, 'excluded_paystub_ids', []),
        'excluded_paystub_employers': getattr(user, 'excluded_paystub_employers', []),
        'stripe_customer_id': getattr(user, 'stripe_customer_id', None),
        'stripe_subscription_id': getattr(user, 'stripe_subscription_id', None)
    }
    # Transactional commit with optimistic-concurrency rev check. Reads the
    # current rev inside the transaction; if expected_rev was supplied and no
    # longer matches, abort with ConcurrentModificationError (→ 409 at the API).
    @firestore.transactional
    def _commit(txn):
        snap = user_ref.get(transaction=txn)
        current_rev = (snap.to_dict() or {}).get('rev', 0) if snap.exists else 0
        current_rev = current_rev or 0
        if expected_rev is not None and current_rev != expected_rev:
            raise ConcurrentModificationError(current_rev, expected_rev)
        data['rev'] = current_rev + 1
        txn.set(user_ref, data, merge=True)
        return current_rev + 1

    new_rev = _commit(db.transaction())
    logging.info(f"Successfully saved encrypted state for {user_id} (rev {new_rev})")
    return new_rev

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
        
    # Wipe Checks
    checks = user_ref.collection('outstanding_checks').limit(500).get()
    while len(checks) > 0:
        batch = db.batch()
        for doc in checks:
            batch.delete(doc.reference)
        batch.commit()
        checks = user_ref.collection('outstanding_checks').limit(500).get()
    
    logging.info(f"Wiped subcollections for user {user_id}")
def save_feedback(uid, email, feedback_data):
    """Saves user feedback to a dedicated collection, with a local fallback for dev."""
    db = get_db()
    
    # Enrich feedback data
    feedback_data.update({
        'uid': uid,
        'email': email,
        'timestamp': datetime.utcnow().isoformat() # Use ISO string for local or server timestamp for Firestore
    })
    
    if not db: 
        logging.warning("save_feedback: Firestore DB not initialized. Falling back to local 'feedback_log.json'.")
        try:
            import json
            log_path = 'feedback_log.json'
            logs = []
            if os.path.exists(log_path):
                with open(log_path, 'r') as f:
                    logs = json.load(f)
            logs.append(feedback_data)
            with open(log_path, 'w') as f:
                json.dump(logs, f, indent=4)
            return True
        except Exception as e:
            logging.error(f"Failed to save feedback to local log: {e}")
            return False
    
    try:
        logging.info(f"Saving feedback to Firestore for UID: {uid}")
        # Use server timestamp for Firestore instead of the ISO string set above
        from firebase_admin import firestore
        feedback_data['timestamp'] = firestore.SERVER_TIMESTAMP
        feedback_ref = db.collection('feedback').document()
        feedback_ref.set(feedback_data)
        logging.info("Feedback saved to Firestore successfully.")
        return True
    except Exception as e:
        import traceback
        logging.error(f"Failed to save feedback to Firestore: {e}")
        logging.error(traceback.format_exc())
        return False

def save_ai_insight(user_id, topic, detail):
    """Saves or updates a persistent AI insight about the user's habits or goals."""
    db = get_db()
    if not db: return
    
    try:
        # Use a deterministic ID based on topic to allow updates to the same "knowledge"
        doc_id = f"{topic.lower().replace(' ', '_')}"
        insight_ref = db.collection('users').document(user_id).collection('ai_insights').document(doc_id)
        insight_ref.set({
            'topic': topic,
            'detail': detail,
            'last_updated': datetime.now().isoformat()
        })
        logging.info(f"AI Insight '{topic}' saved for user {user_id}")
    except Exception as e:
        logging.error(f"Failed to save AI insight: {e}")

def get_ai_insights(user_id):
    """Fetches all persistent AI insights for a user."""
    db = get_db()
    if not db: return []
    
    try:
        insights = db.collection('users').document(user_id).collection('ai_insights').get()
        return [doc.to_dict() for doc in insights]
    except Exception as e:
        logging.error(f"Failed to fetch AI insights: {e}")
        return []

def save_user_memory(user_id, fact_id, category, content, confidence_score=1.0):
    """Saves a structured memory fact for the AI advisor to use across sessions."""
    db = get_db()
    if not db: return False
    
    try:
        if not fact_id:
            fact_id = str(uuid.uuid4())
            
        memory_ref = db.collection('users').document(user_id).collection('user_memory').document(fact_id)
        memory_ref.set({
            'fact_id': fact_id,
            'category': category,
            'content': content,
            'confidence_score': confidence_score,
            'last_updated': datetime.now().isoformat()
        }, merge=True)
        logging.info(f"User memory fact '{fact_id}' saved for user {user_id}")
        return True
    except Exception as e:
        logging.error(f"Failed to save user memory: {e}")
        return False

def get_user_memories(user_id):
    """Fetches all semantic memory facts for a user from the user_memory collection."""
    db = get_db()
    if not db: return []
    
    try:
        memories = db.collection('users').document(user_id).collection('user_memory').get()
        return [doc.to_dict() for doc in memories]
    except Exception as e:
        logging.error(f"Failed to fetch user memories: {e}")
        return []

def get_user_summary_for_brief(user_id):
    """
    Optimized version of get_user_data specifically for the AI Health Brief.
    Fetches only essential context and the most recent 100 transactions to prevent timeouts.
    """
    db = get_db()
    if not db:
        logging.error(f"get_user_summary_for_brief: DB connection failed for user {user_id}")
        return User(filing_status=FilingStatus.SINGLE, state=USState.CA), [], [], [], [], [], [], [], [], [], [], False, [], [], []

    try:
        user_ref = db.collection('users').document(user_id)
        doc = user_ref.get()
        if not doc.exists:
            logging.warning(f"get_user_summary_for_brief: User doc not found for {user_id}")
            return User(filing_status=FilingStatus.SINGLE, state=USState.CA), [], [], [], [], [], [], [], [], [], [], False, [], [], []
        
        data = doc.to_dict()
        
        # Build shallow user object
        user = User(
            filing_status=safe_enum(FilingStatus, data.get('filing_status'), FilingStatus.SINGLE),
            state=safe_enum(USState, data.get('state'), USState.CA)
        )

        # Parse essential lists (shallowly)
        incomes = [Income(amount=inc['amount'], income_type=safe_enum(IncomeType, inc.get('income_type'), IncomeType.ANNUAL_SALARY), year=inc.get('year', 2026)) for inc in data.get('incomes', [])]
        
        assets = [Asset(ticker=ass['ticker'], shares=ass['shares'], cost_basis=ass['cost_basis'], asset_type=safe_enum(AssetType, ass.get('asset_type'), AssetType.STOCK)) for ass in data.get('assets', [])]
        
        debts = [Debt(name=dbt['name'], initial_amount=dbt['initial_amount'], amount_paid=dbt['amount_paid'], interest_rate=dbt.get('interest_rate')) for dbt in data.get('debts', [])]
        
        retirement_accounts = [RetirementAccount(id=ra.get('id'), name=ra['name'], account_type=safe_enum(AccountType, ra.get('account_type'), AccountType.TRADITIONAL_IRA)) for ra in data.get('retirement_accounts', [])]
        
        insurances = [Insurance(name=ins['name'], amount=ins['amount'], insurance_type=ins.get('insurance_type', 'Auto')) for ins in data.get('insurances', [])]

        # Optimization: Fetch ONLY the most recent 100 transactions
        transactions = []
        txn_docs = user_ref.collection('transactions').order_by('date', direction=firestore.Query.DESCENDING).limit(100).get()
        for t_doc in txn_docs:
            t = t_doc.to_dict()
            transactions.append(Transaction(id=t_doc.id, user_id=user_id, amount=t['amount'], date=t['date'], name=t['name'], category=t.get('category'), pending=t.get('pending', False)))

        # Optimization: Fetch only pending checks
        outstanding_checks = []
        check_docs = user_ref.collection('outstanding_checks').where('status', '==', 'PENDING').get()
        for c_doc in check_docs:
            c = c_doc.to_dict()
            outstanding_checks.append(OutstandingCheck(id=c_doc.id, amount=c['amount'], payee=c['payee'], status=CheckStatus.PENDING))

        # Placeholder for other data not strictly needed for brief or already shallow
        plaid_items = []
        # Parse additional metadata for AI Context
        budgets_data = data.get('budgets', [])
        budgets = [Budget(
            id=b.get('id', 'legacy'),
            category=b.get('category', 'Other'),
            limit_amount=float(b.get('limit_amount', 0)),
            period=b.get('period', 'MONTHLY')
        ) for b in budgets_data]
        
        custom_categories = data.get('custom_categories', [])
        ignored_flexible = data.get('ignored_flexible', [])
        has_completed_onboarding = data.get('has_completed_onboarding', False)
        
        plaid_items = []
        paystubs = []
        custom_rules = []

        return UserData(
            user=user,
            incomes=incomes,
            assets=assets,
            debts=debts,
            retirement_accounts=retirement_accounts,
            insurances=insurances,
            plaid_items=plaid_items,
            budgets=budgets,
            transactions=transactions,
            paystubs=paystubs,
            custom_rules=custom_rules,
            has_completed_onboarding=has_completed_onboarding,
            custom_categories=custom_categories,
            outstanding_checks=outstanding_checks,
            ignored_flexible=ignored_flexible,
        )

    except Exception as e:
        import traceback
        logging.error(f"Failed to fetch user summary for brief: {e}")
        logging.error(traceback.format_exc())
        return _empty_user_data()

def update_user_fields(user_id, fields_dict):
    """
    Performs a partial update of top-level fields for a user document.
    Much faster than full save_user_data for non-relational fields.
    """
    db = get_db()
    if db is None: return False
    try:
        user_ref = db.collection('users').document(user_id)
        user_ref.update(fields_dict)
        return True
    except Exception as e:
        logging.error(f"Failed to update user fields for {user_id}: {e}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Atomic mutations + audit log
# ─────────────────────────────────────────────────────────────────────────────
# Top-level arrays on the user document (assets, debts, incomes, etc.) are the
# main concurrent-write footgun: two tabs open or a Plaid sync racing a manual
# edit can clobber each other because save_user_data does a full read-modify-
# write of the whole user doc. These helpers wrap targeted mutations in
# Firestore transactions, which automatically retry on contention.

def _write_audit_log(db, user_id, action, entity_type, entity_id=None, before=None, after=None, metadata=None):
    """Append a single audit log entry. Best-effort — never throws."""
    try:
        log_ref = db.collection('users').document(user_id).collection('audit_log').document()
        log_ref.set({
            'timestamp': firestore.SERVER_TIMESTAMP,
            'action': action,            # 'update' / 'create' / 'delete'
            'entity_type': entity_type,  # 'asset' / 'goal' / 'budget' / etc.
            'entity_id': entity_id,
            'before': before,
            'after': after,
            'metadata': metadata or {},
        })
    except Exception as e:
        logging.warning(f"[audit_log] failed to write entry for {user_id}: {e}")


def get_audit_log(user_id, limit=100):
    """Return the most recent audit log entries for a user."""
    db = get_db()
    if db is None:
        return []
    try:
        snaps = db.collection('users').document(user_id) \
            .collection('audit_log') \
            .order_by('timestamp', direction=firestore.Query.DESCENDING) \
            .limit(limit) \
            .get()
        out = []
        for s in snaps:
            d = s.to_dict() or {}
            ts = d.get('timestamp')
            # Firestore Timestamp → ISO string for JSON serialization
            if ts is not None and hasattr(ts, 'isoformat'):
                d['timestamp'] = ts.isoformat()
            d['id'] = s.id
            out.append(d)
        return out
    except Exception as e:
        logging.error(f"[audit_log] failed to read for {user_id}: {e}")
        return []


def update_asset_cost_basis_atomic(user_id, plaid_account_id, new_cost_basis_per_share):
    """
    Atomically update a single asset's cost_basis field. Uses a Firestore
    transaction so concurrent writes (manual edit + Plaid sync) don't clobber
    each other. Writes an audit log entry on success.

    Returns (success: bool, old_value: float|None, new_value: float|None).
    """
    db = get_db()
    if db is None:
        return False, None, None
    user_ref = db.collection('users').document(user_id)

    @firestore.transactional
    def _txn(transaction):
        snap = user_ref.get(transaction=transaction)
        if not snap.exists:
            return False, None, None
        data = snap.to_dict() or {}
        assets = data.get('assets', [])
        old_value = None
        modified = False
        for a in assets:
            if a.get('plaid_account_id') == plaid_account_id:
                old_value = a.get('cost_basis')
                a['cost_basis'] = new_cost_basis_per_share
                modified = True
                break
        if not modified:
            return False, None, None
        transaction.update(user_ref, {'assets': assets})
        return True, old_value, new_cost_basis_per_share

    try:
        success, old_v, new_v = _txn(db.transaction())
        if success:
            _write_audit_log(
                db, user_id, 'update', 'asset',
                entity_id=plaid_account_id,
                before={'cost_basis': old_v},
                after={'cost_basis': new_v},
                metadata={'field': 'cost_basis'},
            )
        return success, old_v, new_v
    except Exception as e:
        logging.error(f"[atomic] update_asset_cost_basis_atomic failed for {user_id}: {e}")
        return False, None, None


def update_goal_atomic(user_id, goal_id, updates: dict):
    """
    Atomically merge updates into a goal subcollection document. Subcollection
    docs are isolated so contention is rare, but transactions also write the
    audit log atomically, which we want for any money-adjacent mutation.

    `updates` is a partial dict — only the fields being changed.
    Returns (success, before_dict, after_dict).
    """
    db = get_db()
    if db is None:
        return False, None, None
    goal_ref = db.collection('users').document(user_id).collection('goals').document(goal_id)

    @firestore.transactional
    def _txn(transaction):
        snap = goal_ref.get(transaction=transaction)
        if not snap.exists:
            return False, None, None
        before = snap.to_dict() or {}
        # Compute after-state for audit
        after = {**before, **updates}
        transaction.update(goal_ref, updates)
        return True, before, after

    try:
        success, before, after = _txn(db.transaction())
        if success:
            _write_audit_log(
                db, user_id, 'update', 'goal',
                entity_id=goal_id,
                before={k: before.get(k) for k in updates.keys()},
                after={k: after.get(k) for k in updates.keys()},
            )
        return success, before, after
    except Exception as e:
        logging.error(f"[atomic] update_goal_atomic failed for {user_id}/{goal_id}: {e}")
        return False, None, None


def create_goal_atomic(user_id, goal_data: dict):
    """Create a new goal in the subcollection + log it. Returns the new goal_id."""
    db = get_db()
    if db is None:
        return None
    try:
        goals_col = db.collection('users').document(user_id).collection('goals')
        new_ref = goals_col.document()
        new_ref.set(goal_data)
        _write_audit_log(
            db, user_id, 'create', 'goal',
            entity_id=new_ref.id,
            after=goal_data,
        )
        return new_ref.id
    except Exception as e:
        logging.error(f"[atomic] create_goal_atomic failed for {user_id}: {e}")
        return None


def delete_goal_atomic(user_id, goal_id):
    """Delete a goal + log it. Captures the deleted state in the audit entry."""
    db = get_db()
    if db is None:
        return False
    goal_ref = db.collection('users').document(user_id).collection('goals').document(goal_id)
    try:
        snap = goal_ref.get()
        before = snap.to_dict() if snap.exists else None
        goal_ref.delete()
        _write_audit_log(
            db, user_id, 'delete', 'goal',
            entity_id=goal_id,
            before=before,
        )
        return True
    except Exception as e:
        logging.error(f"[atomic] delete_goal_atomic failed for {user_id}/{goal_id}: {e}")
        return False


def check_and_mark_milestone(user_id, current_net_worth):
    """
    Atomically check if net worth has crossed a milestone since the last
    recorded crossing, and update the last-crossed marker on the user doc.
    Returns the newly-crossed milestone amount (int) or None.

    Milestones: $10K, $25K, $50K, $100K, $250K, $500K, $1M, $2.5M, $5M, $10M.
    Each fires at most once per user (tracked via highest_milestone_crossed).
    """
    MILESTONES = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000]
    db = get_db()
    if db is None:
        return None
    user_ref = db.collection('users').document(user_id)

    @firestore.transactional
    def _txn(transaction):
        snap = user_ref.get(transaction=transaction)
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        prior_high = data.get('highest_milestone_crossed', 0) or 0
        # Find the highest milestone now crossed
        new_high = prior_high
        for m in MILESTONES:
            if current_net_worth >= m and m > new_high:
                new_high = m
        if new_high <= prior_high:
            return None
        transaction.update(user_ref, {'highest_milestone_crossed': new_high})
        return new_high

    try:
        new_milestone = _txn(db.transaction())
        if new_milestone is not None:
            _write_audit_log(
                db, user_id, 'milestone', 'net_worth',
                after={'amount': new_milestone, 'net_worth_at_cross': current_net_worth},
            )
        return new_milestone
    except Exception as e:
        logging.error(f"[milestone] failed for {user_id}: {e}")
        return None
