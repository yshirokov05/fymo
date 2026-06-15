import os
import re
import plaid
from plaid.api import plaid_api
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.link_token_create_request_update import LinkTokenCreateRequestUpdate
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.investments_holdings_get_request import InvestmentsHoldingsGetRequest
from plaid.model.investments_transactions_get_request import InvestmentsTransactionsGetRequest
from plaid.model.investments_transactions_get_request_options import InvestmentsTransactionsGetRequestOptions
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions
from plaid.model.liabilities_get_request import LiabilitiesGetRequest
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from models import Asset, AssetType, RetirementAccount, AccountType, Transaction, Debt, Paystub, TaxTreatment, DebtType, Income, IncomeType
from datetime import datetime, timedelta
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

PLAID_CLIENT_ID = os.getenv('PLAID_CLIENT_ID', '').replace('\n', '').replace('\r', '').strip()
PLAID_SECRET = os.getenv('PLAID_SECRET', '').replace('\n', '').replace('\r', '').strip()
PLAID_ENV = os.getenv('PLAID_ENV', 'sandbox').replace('\n', '').replace('\r', '').strip()
PLAID_REDIRECT_URI = os.getenv('PLAID_REDIRECT_URI', '').replace('\n', '').replace('\r', '').strip() # Required for Production OAuth

host = plaid.Environment.Sandbox
if PLAID_ENV == 'development':
    host = plaid.Environment.Development
elif PLAID_ENV == 'production':
    host = plaid.Environment.Production

configuration = plaid.Configuration(
    host=host,
    api_key={
        'clientId': PLAID_CLIENT_ID,
        'secret': PLAID_SECRET,
    }
)

api_client = plaid.ApiClient(configuration)
client = plaid_api.PlaidApi(api_client)

def normalize_merchant_name(name):
    if not name: return ""
    # Strip common branch/location noise (e.g. - WES, - Westga, #1234, @ Town Center)
    # This helps deduplicate transactions like "Classic Car Wash - WES" vs "Classic Car Wash - Westga"
    s = name.lower()
    s = re.sub(r' - [a-z0-9]+$', '', s) # Strip trailing branch codes like - WES
    s = re.sub(r' #[0-9]+$', '', s)    # Strip trailing numbers like #1234
    s = re.sub(r' [a-z]st$', '', s)    # Strip common location noise
    s = re.sub(r' [a-z]ga$', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s.upper()

def create_link_token(user_id):
    if not PLAID_CLIENT_ID or not PLAID_SECRET:
        error_msg = "Plaid API keys are missing in the server environment. Please set PLAID_CLIENT_ID and PLAID_SECRET in Firebase secrets."
        print(f"CONFIGURATION ERROR: {error_msg}")
        raise ValueError(error_msg)
        
    try:
        args = {
            "products": [Products('transactions')],
            "optional_products": [Products('investments'), Products('liabilities'), Products('identity')],
            "client_name": "Fymo",
            "country_codes": [CountryCode('US')],
            "language": 'en',
            "user": LinkTokenCreateRequestUser(client_user_id=str(user_id))
        }
        
        # In Production, most banks REQUIRE a redirect_uri for OAuth
        if PLAID_REDIRECT_URI:
            args["redirect_uri"] = PLAID_REDIRECT_URI
            
        request = LinkTokenCreateRequest(**args)
        response = client.link_token_create(request)
        return response.to_dict()['link_token']
    except Exception as e:
        print(f"PLAID ERROR: {str(e)}")
        raise e

def create_update_token(user_id, access_token):
    """
    Generates a link token in 'update' mode to fix an existing item connection.

    `account_selection_enabled=True` re-presents Plaid's account-selection screen
    so the user can grant access to accounts opened AFTER the original link (e.g. a
    newly opened Vanguard Cash Plus account). Without this flag, update mode only
    repairs auth on the originally authorized accounts and silently omits any new
    account — which is why a freshly opened account never shows up on re-sync.
    """
    try:
        args = {
            "products": [Products('transactions')],
            "optional_products": [Products('investments'), Products('liabilities'), Products('identity')],
            "client_name": "Fymo",
            "country_codes": [CountryCode('US')],
            "language": 'en',
            "user": LinkTokenCreateRequestUser(client_user_id=str(user_id)),
            "access_token": access_token,  # This triggers 'update' mode
            "update": LinkTokenCreateRequestUpdate(account_selection_enabled=True),
        }
        # In Production, OAuth institutions require a redirect_uri in update mode too.
        if PLAID_REDIRECT_URI:
            args["redirect_uri"] = PLAID_REDIRECT_URI

        request = LinkTokenCreateRequest(**args)
        response = client.link_token_create(request)
        return response.to_dict()['link_token']
    except Exception as e:
        print(f"PLAID UPDATE ERROR: {str(e)}")
        raise e

def exchange_public_token(public_token):
    request = ItemPublicTokenExchangeRequest(
        public_token=public_token
    )
    response = client.item_public_token_exchange(request)
    return response.to_dict() # includes access_token and item_id



import json

_CATEGORY_CONFIG = None
def _get_category_config():
    global _CATEGORY_CONFIG
    if _CATEGORY_CONFIG is None:
        try:
            config_path = os.path.join(os.path.dirname(__file__), 'category_mapping.json')
            with open(config_path, 'r') as f:
                _CATEGORY_CONFIG = json.load(f)
        except Exception as e:
            logging.error(f"Failed to load category mapping: {e}")
            _CATEGORY_CONFIG = {}
    return _CATEGORY_CONFIG

def categorize_transaction(name, plaid_categories, custom_rules=None):
    """
    Robust categorization based on merchant name, Plaid categories, and user Custom Rules.
    """
    name = name.lower()
    
    # 0. User Custom Rules Overrides (Highest Priority)
    # Sort by pattern length DESC so more specific rules win over generic ones.
    # E.g., "STARBUCKS RESERVE" beats "STARBUCKS" when both match.
    if custom_rules:
        sorted_rules = sorted(custom_rules, key=lambda r: len(r.merchant_name), reverse=True)
        for rule in sorted_rules:
            # One-way substring: rule pattern must be contained in transaction name.
            # (Previously bidirectional, which caused long rule patterns to match
            # short transaction names — almost never the intended behavior.)
            if rule.merchant_name.lower() in name:
                return rule.category
                
    config = _get_category_config()
    
    # Check loaded mapping config
    for cat, rules in config.items():
        if any(k in name for k in rules.get("patterns", [])):
            return cat
            
    # Fallback to Plaid categories
    pcats = [c.lower() for c in plaid_categories] if plaid_categories else []
    
    if 'food' in pcats or 'dining' in pcats:
        return "Eating Out"
    if 'transport' in pcats or 'travel' in pcats:
        return "Transportation"
    if 'personal care' in pcats or 'health care' in pcats:
        return "Personal Care"
    if 'entertainment' in pcats or 'recreation' in pcats:
        return "Entertainment"
    if 'rent' in pcats or 'mortgage' in pcats:
        return "Housing"
    if 'utilities' in pcats:
        return "Utilities"
    if 'dividend' in pcats:
        return "Dividends"
    if 'sell' in pcats or 'gain' in pcats:
        return "Capital Gains"

    return pcats[0].capitalize() if pcats else "Other"

def sync_plaid_data(access_token, user_id, custom_rules=None, institution_name=None):
    """
    Fetches account balances, investment holdings, and transactions from Plaid in parallel.
    Returns list of assets, retirement accounts, transactions, debts, paystubs, and incomes.
    """
    try:
        logging.info(f"Syncing data for user: {user_id}")
        
        # Define fetchers for parallel execution
        def fetch_accounts():
            return client.accounts_get(AccountsGetRequest(access_token=access_token)).to_dict()

        def fetch_holdings():
            try:
                return client.investments_holdings_get(InvestmentsHoldingsGetRequest(access_token=access_token)).to_dict()
            except Exception as e:
                logging.warning(f"Investments holdings not supported or failed: {e}")
                return {'holdings': [], 'securities': []}

        def fetch_transactions():
            try:
                end_date = datetime.now().date()
                # Fetch from Jan 1 of current year (YTD) or 365 days back, whichever is earlier
                ytd_start = end_date.replace(month=1, day=1)
                start_date = min(ytd_start, end_date - timedelta(days=365))
                all_transactions = []
                offset = 0
                while True:
                    options = TransactionsGetRequestOptions(offset=offset, count=500)
                    resp = client.transactions_get(TransactionsGetRequest(
                        access_token=access_token,
                        start_date=start_date,
                        end_date=end_date,
                        options=options,
                    )).to_dict()
                    batch = resp.get('transactions', [])
                    all_transactions.extend(batch)
                    if len(all_transactions) >= resp.get('total_transactions', 0) or not batch:
                        break
                    offset += len(batch)
                return {'transactions': all_transactions}
            except Exception as e:
                logging.warning(f"Transactions not supported or failed: {e}")
                return {'transactions': []}

        def fetch_investment_transactions():
            """Fetch investment transaction history (buys, sells, dividends) for total return."""
            try:
                end_date = datetime.now().date()
                # Go back 5 years to capture full brokerage history
                start_date = end_date.replace(year=end_date.year - 5)
                all_inv_txns = []
                offset = 0
                while True:
                    options = InvestmentsTransactionsGetRequestOptions(offset=offset, count=500)
                    resp = client.investments_transactions_get(InvestmentsTransactionsGetRequest(
                        access_token=access_token,
                        start_date=start_date,
                        end_date=end_date,
                        options=options,
                    )).to_dict()
                    batch = resp.get('investment_transactions', [])
                    all_inv_txns.extend(batch)
                    total = resp.get('total_investment_transactions', 0)
                    if len(all_inv_txns) >= total or not batch:
                        break
                    offset += len(batch)
                    if offset > 5000:  # Safety cap
                        break
                # Build a securities map for name/ticker lookups
                sec_map = {s['security_id']: s for s in resp.get('securities', [])}
                return {'investment_transactions': all_inv_txns, 'securities': sec_map}
            except Exception as e:
                logging.warning(f"Investment transactions not supported or failed: {e}")
                return {'investment_transactions': [], 'securities': {}}

        def fetch_liabilities():
            try:
                return client.liabilities_get(LiabilitiesGetRequest(access_token=access_token)).to_dict()
            except Exception as e:
                logging.warning(f"Liabilities not supported or failed: {e}")
                return {'liabilities': {}}

        # Execute Plaid requests in parallel
        results = {}
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_key = {
                executor.submit(fetch_accounts): 'accounts',
                executor.submit(fetch_holdings): 'holdings',
                executor.submit(fetch_transactions): 'transactions',
                executor.submit(fetch_liabilities): 'liabilities',
                executor.submit(fetch_investment_transactions): 'inv_transactions',
            }
            for future in as_completed(future_to_key):
                key = future_to_key[future]
                try:
                    results[key] = future.result()
                except Exception as exc:
                    logging.error(f"Plaid {key} fetch failed for user {user_id}: {exc}")
                    results[key] = {}

        accounts_response = results.get('accounts', {'accounts': []})
        holdings_response = results.get('holdings', {'holdings': [], 'securities': []})
        trans_response = results.get('transactions', {'transactions': []})
        liab_response = results.get('liabilities', {'liabilities': {}})
        inv_trans_result = results.get('inv_transactions', {'investment_transactions': [], 'securities': {}})

        if not accounts_response.get('accounts'):
            logging.error(f"No accounts returned for user {user_id}")
            return [], [], [], [], [], [], []

        synced_account_ids = [acc['account_id'] for acc in accounts_response.get('accounts', [])]

        credit_liabilities = {}
        for credit in liab_response.get('liabilities', {}).get('credit', []):
            credit_liabilities[credit['account_id']] = credit

        logging.info(f"Retrieved {len(accounts_response['accounts'])} accounts from Plaid.")
        
        new_assets = []
        new_retirement_accounts = []
        new_transactions = []
        new_debts = []
        new_paystubs = []
        new_incomes = []
        
        # Map Plaid Accounts to our models
        account_id_to_name = {acc['account_id']: acc['name'] for acc in accounts_response['accounts']}
        
        for acc in accounts_response['accounts']:
            subtype = acc.get('subtype', '').lower()
            name = acc['name'].lower()
            official_name = (acc.get('official_name') or '').lower()
            # Use 'available' balance for checking/savings for better real-time accuracy
            balance = acc['balances'].get('available') if (acc['type'] == 'depository' and acc['balances'].get('available') is not None) else acc['balances']['current']
            
            print(f"Processing Account: {acc['name']} ({acc['type']}/{subtype}), Balance: {balance}")
            
            # User requested specific accounts move to Investments
            is_investment_linked = 'brokerage' in name or 'brokerage' in official_name or acc['type'] == 'investment'
            
            atype = AssetType.CASH
            if subtype == 'checking': atype = AssetType.CHECKING
            elif subtype == 'savings': atype = AssetType.SAVINGS
            # 'cash management' = high-yield cash-management accounts (e.g. Vanguard
            # Cash Plus, Fidelity CMA, Wealthfront Cash). Treat as HYSA so they read
            # as interest-bearing savings rather than a plain checking-style "cash".
            elif subtype in ['hsa', 'cd', 'money market', 'cash management']: atype = AssetType.HIGH_YIELD_SAVINGS
            # Fallback for institutions that don't tag the subtype but name it clearly.
            elif 'cash plus' in name or 'cash plus' in official_name: atype = AssetType.HIGH_YIELD_SAVINGS
            
            if is_investment_linked:
                atype = AssetType.STOCK
                
            # Handle Debts (Credit Cards, Loans)
            if acc['type'] in ['credit', 'loan'] or 'credit card' in name:
                print(f"Adding Debt: {acc['name']} = {balance}")
                
                # Try to get detailed APR from liabilities
                interest_rate = 0.0
                liab = credit_liabilities.get(acc['account_id'], {})
                aprs = liab.get('aprs', [])
                if aprs:
                    # Use the purchase_apr or just the first one available
                    purchase_apr = next((a for a in aprs if a.get('apr_type') == 'purchase_apr'), aprs[0])
                    interest_rate = float(purchase_apr.get('annual_percentage_rate', 0)) / 100.0
                    interest_rate = min(interest_rate, 1.0)  # Cap at 100% APR — Plaid occasionally returns outlier values
                
                # ── Card naming ────────────────────────────────────────────
                # Two distinct fields:
                #   official_name → EXACTLY what Plaid returned (untouched).
                #                   We preserve trademarks, "Ultimate Rewards®",
                #                   etc. because the AI card-summary endpoint
                #                   needs the raw product line to recognize the
                #                   card. Stripping that text was making cards
                #                   unidentifiable downstream.
                #   name          → short human label for the table header
                #                   (e.g. "Chase Sapphire Preferred", "Capital
                #                   One Quicksilver"). Built from the most
                #                   informative source we can find.
                raw_name = (acc.get('name') or '').strip()
                raw_official = (acc.get('official_name') or '').strip()
                # CRITICAL: store the official_name UNMODIFIED for downstream
                # consumers (AI summary, dedupe). Display name is a separate
                # derivation below.
                official_name = raw_official or raw_name
                mask = acc.get('mask')

                # Product-line keywords we recognize as "real" card identifiers
                # (worth surfacing in the display name).
                product_keywords = [
                    'sapphire', 'reserve', 'preferred', 'freedom', 'ink',
                    'gold', 'platinum', 'green', 'business',
                    'active cash', 'autograph', 'reflect', 'bilt', 'quicksilver',
                    'savor', 'venture', 'spark', 'aspire', 'altitude',
                    'unlimited', 'flex', 'cash+',
                ]
                # Network/noise terms we DO want to strip from the display name
                # (but keep in official_name).
                network_noise = ['visa', 'mastercard', 'amex', 'american express',
                                 'discover', 'signature', 'world elite', 'world']

                def _strip_for_display(s):
                    if not s:
                        return ''
                    s = s.replace('®', '').replace('™', '').replace('©', '')
                    if mask:
                        s = s.replace(f"-{mask}", '').replace(f" {mask}", '').replace(mask, '')
                    for kw in network_noise:
                        s = re.sub(rf'\b{re.escape(kw)}\b', '', s, flags=re.IGNORECASE)
                    return re.sub(r'\s+', ' ', s).strip(' -·')

                clean_official = _strip_for_display(raw_official)
                clean_name = _strip_for_display(raw_name)

                # Pick whichever clean string contains a real product keyword.
                def _has_product(s):
                    if not s:
                        return False
                    sl = s.lower()
                    return any(kw in sl for kw in product_keywords)

                if _has_product(clean_official):
                    display_name = clean_official
                elif _has_product(clean_name):
                    display_name = clean_name
                else:
                    # Neither carries a recognized product — fall back to whichever
                    # is more specific. Prefer official over the generic "Credit Card".
                    candidate = clean_official or clean_name or 'Credit Card'
                    generic = {'credit card', 'card', 'rewards card', 'visa card', 'mastercard card', ''}
                    if candidate.lower() in generic:
                        # Prefix with the institution to at least disambiguate which bank
                        inst = (institution_name or '').replace(' Bank', '').replace(' Financial', '').strip()
                        if not inst:
                            inst_lower = raw_official.lower()
                            if 'chase' in inst_lower: inst = 'Chase'
                            elif 'amex' in inst_lower or 'american express' in inst_lower: inst = 'Amex'
                            elif 'capital one' in inst_lower: inst = 'Capital One'
                            elif 'citi' in inst_lower: inst = 'Citi'
                            elif 'discover' in inst_lower: inst = 'Discover'
                            elif 'wells' in inst_lower: inst = 'Wells Fargo'
                        display_name = f"{inst} {candidate}".strip() if inst else candidate
                    else:
                        display_name = candidate

                # Title-case the display name for readability (Plaid often returns ALL CAPS)
                # unless the string already has mixed case (preserving things like "Cash+").
                if display_name and display_name.upper() == display_name:
                    display_name = display_name.title()

                new_debts.append(Debt(
                    name=display_name,
                    initial_amount=balance,
                    amount_paid=0.0,
                    monthly_payment=acc['balances'].get('minimum_payment', 0) or 0,
                    interest_rate=interest_rate,
                    plaid_account_id=acc['account_id'],
                    institution_name=institution_name or display_name,
                    official_name=official_name,
                    debt_type=DebtType.REVOLVING
                ))
                logging.info(f"Identified REVOLVING debt: {display_name} | Balance: {balance}")
            elif acc['type'] == 'investment' or is_investment_linked:
                ra_type = AccountType.TRADITIONAL_IRA
                if 'roth' in name or subtype == 'roth': ra_type = AccountType.ROTH_IRA
                elif '401k' in name or '401(k)' in name or subtype == '401k': ra_type = AccountType.K401
                
                if ra_type != AccountType.TRADITIONAL_IRA or any(k in name for k in ['ira', 'roth', '401k', 'retirement']):
                    print(f"Registering Retirement Account: {acc['name']}")
                    ra = RetirementAccount(id=acc['account_id'], name=acc.get('official_name') or acc['name'], account_type=ra_type)
                    new_retirement_accounts.append(ra)

                # Skip direct margin checks for retirement accounts
                is_ra = acc['account_id'] in [r.id for r in new_retirement_accounts]
                if balance < -0.01 and not is_ra:
                    print(f"Adding Direct Margin Debt: {abs(balance)}")
                    new_debts.append(Debt(
                        name=f"Margin: {acc['name']}",
                        initial_amount=abs(balance),
                        amount_paid=0.0,
                        monthly_payment=0,
                        interest_rate=0.0,
                        plaid_account_id=f"margin_bal_{acc['account_id']}",
                        institution_name=acc['name'],
                        official_name=acc.get('official_name') or acc['name'],
                        debt_type=DebtType.REVOLVING
                    ))
            else:
                new_assets.append(Asset(
                    ticker=acc['name'][:15].upper(),
                    shares=balance,
                    cost_basis=1.0,
                    asset_type=atype,
                    plaid_account_id=acc['account_id'],
                    institution_name=acc['name'],
                    official_name=acc.get('official_name') or acc['name']
                ))

        securities = {s['security_id']: s for s in holdings_response['securities']}
        CASH_TICKERS = ['VMFXX', 'SPAXX', 'FDRXX', 'TMSXX', 'CUR:USD', 'CASH', 'USD', 'SWVXX', 'VBTIX', 'VUSXX', 'SNSXX', 'FZFXX']
        market_value_per_account: dict[str, float] = {}
        cost_basis_per_account: dict[str, float] = {}  # Track total cost basis from holdings per account
        margin_from_holdings_per_account: dict[str, float] = {} # Track identified debt to avoid double counting
        
        all_tickers = [s.get('ticker_symbol') for s in holdings_response['securities'] if s.get('ticker_symbol')]
        from price_service import get_multiple_prices
        price_map = get_multiple_prices(all_tickers)
        
        for holding in holdings_response['holdings']:
            sec = securities.get(holding['security_id'])
            if not sec: continue
            
            ticker = (sec.get('ticker_symbol') or sec.get('name')[:15]).upper()
            shares = float(holding['quantity'])
            p_data = price_map.get(ticker) if price_map else None
            # Ensure current_price is never None
            current_price = 1.0
            if (p_data and isinstance(p_data, dict)):
                current_price = p_data.get('current_price', 1.0)
            else:
                current_price = float(sec.get('close_price') or 1.0)
            
            market_value = shares * current_price
            
            # Plaid-reported value for the margin check to avoid drift from fresh prices
            plaid_reported_value = holding.get('institution_value')
            if plaid_reported_value is None:
                plaid_reported_value = shares * float(sec.get('close_price') or 0.0)
            else:
                plaid_reported_value = float(plaid_reported_value)
            
            print(f"Holding: {ticker}, Shares: {shares}, Price: {current_price}, Value: {market_value}, PlaidVal: {plaid_reported_value}")
            
            acc_id = holding['account_id']
            
            # 1. Skip zero-balance cash holdings
            if (ticker in CASH_TICKERS or 'money market' in (sec.get('type') or '').lower()) and abs(shares) <= 0.01:
                continue
            
            is_ra = acc_id in [ra.id for ra in new_retirement_accounts]
                
            # 2. Handle Negative Holdings (Margin) - Skip for Retirement
            if market_value < -0.01 and not is_ra:
                debt_amt = abs(market_value)
                plaid_debt_amt = abs(plaid_reported_value)
                print(f"Adding Negative Holding Margin: {ticker} = {debt_amt} (Plaid: {plaid_debt_amt})")
                # If it's a negative CUR:USD, it's almost always a settlement drift / pending trade
                friendly_margin_name = "Margin Loan" if ticker == "CUR:USD" else f"Margin Loan: {ticker}"
                
                new_debts.append(Debt(
                    name=friendly_margin_name,
                    initial_amount=debt_amt,
                    amount_paid=0.0,
                    monthly_payment=0,
                    interest_rate=0.0,
                    plaid_account_id=f"margin_{holding['account_id']}_{holding['security_id']}",
                    institution_name=account_id_to_name.get(acc_id, "Investment Account"),
                    official_name=next((a['official_name'] or a['name'] for a in accounts_response['accounts'] if a['account_id'] == acc_id), None),
                    debt_type=DebtType.REVOLVING
                ))
                # Track this debt so we don't count it again in the global check
                margin_from_holdings_per_account[acc_id] = margin_from_holdings_per_account.get(acc_id, 0) + plaid_debt_amt
                continue

            # 3. Track market value for POSITIVE assets for margin calculation
            # IMPORTANT: Use Plaid's reported value here to match against Plaid's net_equity
            market_value_per_account[acc_id] = market_value_per_account.get(acc_id, 0) + plaid_reported_value

            # 4. Add as Asset
            # Calculation of gain: Plaid often provides cost_basis as total cost.
            # We want to store the "official" gain from the institution if possible.
            # Some banks provide 'institution_value', which we can compare to 'cost_basis'.
            p_cost_basis = float(holding.get('cost_basis') or 0)
            p_value = float(holding.get('institution_value') or market_value)
            p_gain = p_value - p_cost_basis if p_cost_basis > 0 else 0
            
            # Determine asset type based on ticker/security type
            is_cash_holding = ticker in CASH_TICKERS or 'money market' in (sec.get('type') or '').lower()
            h_atype = AssetType.CASH if is_cash_holding else AssetType.STOCK

            # Track cost basis from holdings for accurate return calculations
            # Only count non-cash holdings with valid cost basis.
            # Sanity guard: reject individual-holding cost basis > $100M (Plaid occasionally
            # returns absurd values for delisted/exotic securities; letting those through
            # poisons the aggregate return calculation). $100M/position is more than any
            # realistic retail holding.
            SANE_PER_HOLDING_BASIS_CAP = 100_000_000  # $100M
            if not is_cash_holding and p_cost_basis > 0:
                if p_cost_basis > SANE_PER_HOLDING_BASIS_CAP:
                    logging.warning(
                        f"Rejecting implausible cost basis for {ticker} in acc {acc_id}: "
                        f"${p_cost_basis:,.2f} (cap: ${SANE_PER_HOLDING_BASIS_CAP:,.0f}). "
                        f"Shares: {shares}, market value: ${market_value:,.2f}"
                    )
                else:
                    cost_basis_per_account[acc_id] = cost_basis_per_account.get(acc_id, 0) + p_cost_basis

            asset = Asset(
                ticker=ticker,
                shares=shares,
                cost_basis=p_cost_basis / shares if shares > 0 else current_price,
                total_gain=p_gain,
                asset_type=h_atype,
                plaid_account_id=f"{holding['account_id']}_{holding['security_id']}",
                institution_name=account_id_to_name.get(acc_id, "Investment Account"),
                official_name=next((a['official_name'] or a['name'] for a in accounts_response['accounts'] if a['account_id'] == acc_id), None),
                last_price_update=datetime.now().isoformat(),
                tax_treatment=TaxTreatment.TAXABLE # Default, will be updated if RA
            )
            if acc_id in [ra.id for ra in new_retirement_accounts]:
                asset.retirement_account_id = acc_id
                ra = next(ra for ra in new_retirement_accounts if ra.id == acc_id)
                if ra.account_type == AccountType.ROTH_IRA:
                    asset.tax_treatment = TaxTreatment.TAX_EXEMPT
                else:
                    asset.tax_treatment = TaxTreatment.TAX_DEFERRED
            
            new_assets.append(asset)

        # 4. Global Margin Check
        for acc in accounts_response['accounts']:
            if acc['type'] == 'investment' or 'brokerage' in acc['name'].lower():
                acc_id = acc['account_id']
                net_equity = acc['balances']['current']
                gross_assets = market_value_per_account.get(acc_id, 0)
                identified_margin = margin_from_holdings_per_account.get(acc_id, 0)
                
                print(f"FINAL MARGIN CHECK for {acc['name']}: Net Equity={net_equity}, Gross Assets={gross_assets}, Identified Margin={identified_margin}")
                
                # total_debt = gross_assets - net_equity
                unexplained_margin = (gross_assets - net_equity) - identified_margin
                
                # Check if RA
                is_ra = acc_id in [ra.id for ra in new_retirement_accounts]
                
                # Use a larger buffer ($1000) for Vanguard/Drift accounts unless it's a huge % of net worth
                # Or just SKIP it if it looks like a known drift pattern
                # If gross_assets and net_equity are within 5% of each other, ignore it.
                drift_tolerance = 0.05 * gross_assets
                
                drift_tolerance = 0.05 * gross_assets
                
                # If the margin is more than 30% of the account value, it's almost certainly a sync/pricing hallucination
                hallucination_threshold = 0.30 * gross_assets
                
                if unexplained_margin > max(1000.0, drift_tolerance) and not is_ra:
                    if unexplained_margin > hallucination_threshold and gross_assets > 0:
                        print(f"SKIPPING MARGIN HALLUCINATION: {unexplained_margin} is > 30% of account {acc_id}")
                    else:
                        print(f"ADDING MARGIN LOAN DEBT (Unexplained remainder): {unexplained_margin}")
                        new_debts.append(Debt(
                            name=f"Brokerage Margin: {acc['name']}",
                            initial_amount=unexplained_margin,
                            amount_paid=0.0, monthly_payment=0, interest_rate=0.0,
                            plaid_account_id=f"margin_calc_{acc_id}",
                            institution_name=acc['name'],
                            official_name=acc.get('official_name') or acc['name']
                        ))
                elif net_equity > (gross_assets + 10.0):
                    # Identified margin is subtracted from the "extra cash" calculation too
                    cash_amt = (net_equity - gross_assets) + identified_margin
                    print(f"ADDING UNINVESTED CASH ASSET: {cash_amt}")
                    new_assets.append(Asset(
                        ticker="CASH",
                        shares=cash_amt, cost_basis=1.0,
                        asset_type=AssetType.CASH,
                        plaid_account_id=f"cash_bal_{acc_id}",
                        institution_name=acc['name'],
                        official_name=acc.get('official_name') or acc['name'],
                        tax_treatment=TaxTreatment.TAXABLE # Default for cash
                    ))
                    # If this cash is in a retirement account, update its tax treatment
                    if acc_id in [ra.id for ra in new_retirement_accounts]:
                        ra = next(ra for ra in new_retirement_accounts if ra.id == acc_id)
                        new_assets[-1].retirement_account_id = acc_id
                        if ra.account_type == AccountType.ROTH_IRA:
                            new_assets[-1].tax_treatment = TaxTreatment.TAX_EXEMPT
                        else:
                            new_assets[-1].tax_treatment = TaxTreatment.TAX_DEFERRED

        # Map Transactions and Auto-detect Paystubs
        for t in trans_response['transactions']:
            amt = float(t['amount'])
            t_date = t['date'].isoformat() if hasattr(t['date'], 'isoformat') else str(t['date'])
            t_name = t['name']
            
            new_transactions.append(Transaction(
                id=t['transaction_id'], user_id=user_id, account_id=t['account_id'],
                amount=amt,
                date=t_date,
                name=t_name,
                category=categorize_transaction(t_name, t.get('category'), custom_rules),
                pending=t.get('pending', False),
                pending_transaction_id=t.get('pending_transaction_id')
            ))
            
            # Auto-detect payroll deposits (negative amount means deposit in Plaid)
            if amt < 0 and not t.get('pending', False):
                name_lower = t_name.lower()
                cat_lower = [c.lower() for c in (t.get('category') or [])]
                # Expanded keyword list — covers more payroll providers and common patterns
                # like "DIRECT PAY", "PPD ID:" (ACH credit), university/employer naming.
                payroll_kws = [
                    'payroll', 'salary', 'gusto', 'adp', 'direct dep', 'direct pay',
                    'paychex', 'workday', 'rippling', 'justworks', 'trinet', 'sequoia',
                    'wages', 'paycheck', 'payday', 'compensation', 'stipend',
                    'ppd id:',  # ACH direct deposit identifier — common for university/scholarship payroll
                ]
                is_payroll_name = any(kw in name_lower for kw in payroll_kws)
                is_payroll_cat = 'payroll' in cat_lower or any('payroll' in c for c in cat_lower)
                if is_payroll_name or is_payroll_cat:
                    # Best-effort: identify deposits that look like scholarship / fellowship /
                    # stipend / 1099 disbursements so they are flagged FICA-exempt. These are
                    # subject to federal+state income tax but NOT to Social Security / Medicare
                    # (7.65%). User can toggle this per-paystub in the Income tab.
                    non_fica_kws = [
                        'scholarship', 'fellowship', 'stipend',
                        'direct pay',   # university disbursements often labelled this way
                        'disbursement', 'grant', 'tuition refund',
                    ]
                    looks_non_fica = any(kw in name_lower for kw in non_fica_kws)
                    new_paystubs.append(Paystub(
                        id=f"paystub_{t['transaction_id']}",
                        user_id=user_id,
                        date=t_date,
                        # Plaid transaction data has no withholding info available — these
                        # deposits are the post-tax NET amount. Always flag as net_primary
                        # so the tax engine excludes them from gross income (avoids
                        # double-taxing already-withheld income).
                        gross_amount=abs(amt),
                        net_amount=abs(amt),
                        tax_withheld=0.0,
                        employer=t_name if t_name else "Auto-detected Payroll",
                        is_net_primary=True,
                        subject_to_fica=not looks_non_fica,
                    ))
            
            # Auto-detect Investment Income (Dividends / Capital Gains)
            if amt < 0: # Deposit
                cat = categorize_transaction(t_name, t.get('category'), custom_rules)
                if cat == "Dividends":
                    new_incomes.append(Income(
                        income_type=IncomeType.DIVIDENDS,
                        amount=abs(amt),
                        year=datetime.now().year,
                        description=t_name
                    ))
                    logging.info(f"Auto-detected DIVIDEND: {t_name} | ${abs(amt)}")
                elif cat == "Capital Gains":
                    new_incomes.append(Income(
                        income_type=IncomeType.CAPITAL_GAINS,
                        amount=abs(amt),
                        year=datetime.now().year,
                        description=t_name
                    ))
                    logging.info(f"Auto-detected CAPITAL GAIN: {t_name} | ${abs(amt)}")

        # ── Investment transaction analysis (realized gains, total invested) ──
        inv_txns = inv_trans_result.get('investment_transactions', [])
        inv_sec_map = inv_trans_result.get('securities', {})

        PERIOD_KEYS = ('1w', '1m', 'ytd', '1y', '2y', '5y', 'all')
        # Same set used in share-ledger reconstruction below — defined here so the buy
        # aggregation loop can skip money-market purchases that don't show up in current_value.
        CASH_LIKE_TICKERS = {
            'CUR:USD', 'USD', 'CASH', 'VMFXX', 'SPAXX', 'FDRXX',
            'SWVXX', 'TMSXX', 'SNSXX', 'FZFXX', 'VBTIX', 'VUSXX',
        }
        _now_date = datetime.now().date()
        _period_starts = {
            '1w': _now_date - timedelta(days=7),
            '1m': _now_date - timedelta(days=30),
            'ytd': _now_date.replace(month=1, day=1),
            '1y': _now_date - timedelta(days=365),
            '2y': _now_date - timedelta(days=730),
            '5y': _now_date - timedelta(days=1825),
            'all': None,
        }

        periods = {p: {'invested': 0.0, 'proceeds': 0.0, 'dividends': 0.0} for p in PERIOD_KEYS}
        total_fees = 0.0
        earliest_txn_date = None

        # Per-account breakdown keyed by Plaid account_id
        by_account: dict = {}

        for txn in inv_txns:
            txn_type = (txn.get('type') or '').lower()
            subtype = (txn.get('subtype') or '').lower()
            amount = float(txn.get('amount') or 0)
            acc_id = txn.get('account_id', '')
            # In Plaid investment transactions: amount > 0 = cash outflow (buy); < 0 = inflow (sell/dividend)
            date_val = txn.get('date')
            if date_val:
                date_str = date_val.isoformat() if hasattr(date_val, 'isoformat') else str(date_val)
                if earliest_txn_date is None or date_str < earliest_txn_date:
                    earliest_txn_date = date_str

            # Initialize per-account entry on first encounter
            if acc_id and acc_id not in by_account:
                by_account[acc_id] = {
                    'name': account_id_to_name.get(acc_id, 'Investment Account'),
                    'current_value': 0.0,
                    'periods': {p: {'invested': 0.0, 'proceeds': 0.0, 'dividends': 0.0} for p in PERIOD_KEYS},
                }

            # Determine which periods this transaction falls into
            txn_date_obj = date_val if hasattr(date_val, 'year') else None
            if txn_date_obj and hasattr(txn_date_obj, 'date'):
                txn_date_obj = txn_date_obj.date()  # Convert datetime to date

            applicable_periods = ['all']
            if txn_date_obj:
                for pk, start in _period_starts.items():
                    if pk != 'all' and start is not None and txn_date_obj >= start:
                        applicable_periods.append(pk)

            if txn_type in ('buy',) or subtype in ('buy',):
                # Resolve security ticker to skip cash-equivalent buys.
                # VMFXX/SPAXX etc. shouldn't show up as "invested" in the activity
                # breakdown — they're cash sweeps, not real investment outflows.
                _sec_id = txn.get('security_id')
                _sec_ticker = (inv_sec_map.get(_sec_id, {}).get('ticker_symbol') or '').upper() if _sec_id else ''
                if _sec_ticker in CASH_LIKE_TICKERS:
                    pass  # skip — money-market buys are not real investment outflows
                else:
                    for pk in applicable_periods:
                        periods[pk]['invested'] += amount
                        if acc_id and acc_id in by_account:
                            by_account[acc_id]['periods'][pk]['invested'] += amount
            elif txn_type in ('sell',) or subtype in ('sell',):
                for pk in applicable_periods:
                    periods[pk]['proceeds'] += abs(amount)
                    if acc_id and acc_id in by_account:
                        by_account[acc_id]['periods'][pk]['proceeds'] += abs(amount)
            elif txn_type in ('dividend',) or subtype in ('dividend', 'qualified dividend', 'non-qualified dividend'):
                for pk in applicable_periods:
                    periods[pk]['dividends'] += abs(amount)
                    if acc_id and acc_id in by_account:
                        by_account[acc_id]['periods'][pk]['dividends'] += abs(amount)
            elif txn_type in ('fee',) or subtype in ('fee', 'commission'):
                total_fees += amount

        # Populate per-account current values and cost basis from holdings (already computed above)
        for acc_id, mv in market_value_per_account.items():
            if acc_id in by_account:
                by_account[acc_id]['current_value'] = round(mv, 2)
                by_account[acc_id]['total_cost_basis'] = round(cost_basis_per_account.get(acc_id, 0), 2)
            elif mv > 0.01:
                by_account[acc_id] = {
                    'name': account_id_to_name.get(acc_id, 'Investment Account'),
                    'current_value': round(mv, 2),
                    'total_cost_basis': round(cost_basis_per_account.get(acc_id, 0), 2),
                    'periods': {p: {'invested': 0.0, 'proceeds': 0.0, 'dividends': 0.0} for p in PERIOD_KEYS},
                }

        # Round per-account period figures
        for acc_data in by_account.values():
            for pk in PERIOD_KEYS:
                for k in ('invested', 'proceeds', 'dividends'):
                    acc_data['periods'][pk][k] = round(acc_data['periods'][pk][k], 2)

        # Aggregate current portfolio value — needed by the period-return reconstruction
        # below AND re-asserted at the bottom of the function for the final payload.
        # Bug fix: this was previously only assigned at the end of the function, so the
        # period-returns try-block silently NameError'd and every period showed N/A.
        total_current_value = sum(market_value_per_account.values())
        total_cost_basis_from_holdings = sum(cost_basis_per_account.values())

        # ── Period-specific portfolio returns ──
        # Value-weighted average of per-ticker returns over each period.
        # Mental model: "if NVDA moved +5% and RDDT +3% this week, my portfolio
        # return is the value-weighted average across all my current holdings."
        # This is what every retail finance app reports (Robinhood/Fidelity/Schwab).
        #
        # We previously tried a Modified Dietz reconstruction from Plaid's 5yr
        # transaction ledger, but Plaid's ledger is incomplete for transferred-in
        # positions and pre-5yr holdings, so _val_at_start systematically undercounted
        # actual portfolio value at period start — producing absurd returns like +343%
        # for 1W. Drop the reconstruction; rely on per-ticker returns from
        # get_multi_period_returns. Those are PRICE-only (raw closes from the Yahoo
        # chart API) — dividends are tracked separately — which keeps this consistent
        # with the snapshot-based portfolio period return and with the benchmarks.
        period_returns = {}
        period_returns_coverage = {}
        try:
            if total_current_value > 100:
                from price_service import get_multi_period_returns as _gmpr

                # Cash-equivalents have no meaningful "return" — exclude from weighting
                _CASH_LIKE = {
                    'CUR:USD', 'USD', 'CASH', 'VMFXX', 'SPAXX', 'FDRXX',
                    'SWVXX', 'TMSXX', 'SNSXX', 'FZFXX', 'VBTIX', 'VUSXX',
                }

                # Build per-ticker current market value from current holdings
                _ticker_mv: dict[str, float] = {}
                for _a in new_assets:
                    _t = (_a.ticker or '').upper().strip()
                    if not _t or _t in _CASH_LIKE:
                        continue
                    _px = _a.current_price or 0
                    _mv = max(0.0, (_a.shares or 0) * _px)
                    if _mv > 0:
                        _ticker_mv[_t] = _ticker_mv.get(_t, 0.0) + _mv

                if _ticker_mv:
                    # Fetch multi-period returns per ticker. yfinance is rate-limit sensitive
                    # from Cloud Functions — too many parallel calls returns empty DataFrames
                    # which was the root cause of 1W/1M N/A. Lower concurrency + longer per-
                    # ticker timeout produces dramatically better coverage in practice.
                    _per_ticker_returns: dict[str, dict] = {}
                    with ThreadPoolExecutor(max_workers=3) as _tex:
                        _tfutures = {_tex.submit(_gmpr, t): t for t in _ticker_mv}
                        for _tf in as_completed(_tfutures):
                            _t = _tfutures[_tf]
                            try:
                                _per_ticker_returns[_t] = _tf.result(timeout=15.0) or {}
                                logging.info(
                                    f"[Sync {user_id}] {_t} multi-period keys: "
                                    f"{sorted(_per_ticker_returns[_t].keys())}"
                                )
                            except Exception as _te:
                                logging.warning(
                                    f"[Sync {user_id}] {_t} multi-period fetch timed out/errored: {_te}"
                                )
                                _per_ticker_returns[_t] = {}

                    _total_mv = sum(_ticker_mv.values())
                    period_returns_coverage = {}  # stores coverage % alongside returns
                    for _pk in ('1w', '1m', 'ytd', '1y', '2y', '5y'):
                        _w_sum = 0.0
                        _w_weight = 0.0
                        for _t, _mv in _ticker_mv.items():
                            _r = _per_ticker_returns.get(_t, {}).get(_pk)
                            if _r is not None:
                                _w_sum += _r * _mv
                                _w_weight += _mv
                        # Require ≥5% of portfolio value priced to report a return.
                        # Portfolios with exotic tickers (PSIX, ASM, USAS, UEC) that yfinance
                        # cannot price are excluded from the weighted average but do NOT block
                        # the entire period calculation. Coverage metadata is stored alongside
                        # the return so the frontend can show a caveat when it's low.
                        if _w_weight > 0 and _total_mv > 0 and (_w_weight / _total_mv) >= 0.05:
                            _cov = round(_w_weight / _total_mv * 100, 0)
                            period_returns[_pk] = round(_w_sum / _w_weight, 2)
                            period_returns_coverage[_pk] = int(_cov)
                            logging.info(
                                f"[Sync {user_id}] {_pk} return: {period_returns[_pk]}% "
                                f"({_cov:.0f}% value coverage)"
                            )
        except Exception as _pr_e:
            logging.warning(f"Period return computation failed: {_pr_e}")

        # Fetch multi-period benchmark returns for S&P 500, Nasdaq, Dow Jones (best-effort).
        # Pass the portfolio's earliest transaction date so the 'all' period benchmark is
        # anchored to when the user actually started investing — not to an arbitrary 5yr window.
        benchmarks = {}
        try:
            from price_service import get_multi_period_returns
            benchmark_tickers = {'spy': 'SPY', 'qqq': 'QQQ', 'dia': 'DIA'}
            _bench_since = earliest_txn_date  # ISO date string, e.g. '2024-03-12' or None
            with ThreadPoolExecutor(max_workers=3) as _bex:
                bfutures = {_bex.submit(get_multi_period_returns, t, _bench_since): k for k, t in benchmark_tickers.items()}
                for bf in as_completed(bfutures):
                    bkey = bfutures[bf]
                    try:
                        result = bf.result(timeout=10.0)
                        for period, ret in result.items():
                            if period not in benchmarks:
                                benchmarks[period] = {}
                            benchmarks[period][bkey] = ret
                    except Exception:
                        pass
        except Exception as _bench_e:
            logging.warning(f"Benchmark fetch failed: {_bench_e}")

        # Aggregate sanity guard: cost basis should not wildly exceed current market value.
        # If it does, the data is corrupt (usually one bad Plaid holding slipped through or
        # a delisted position still has an old institution-reported basis). Zero it rather
        # than writing a poisoned value into Firestore — downstream UI will correctly show
        # "cost basis unavailable" instead of a nonsense -99% return.
        basis_sanity_flag = None
        if total_cost_basis_from_holdings > 0 and total_current_value > 0:
            ratio = total_cost_basis_from_holdings / total_current_value
            if ratio > 5.0:
                logging.warning(
                    f"[Sync {user_id}] Rejecting aggregate cost basis: "
                    f"${total_cost_basis_from_holdings:,.2f} is {ratio:.1f}x current value "
                    f"${total_current_value:,.2f}. Zeroing total_cost_basis."
                )
                basis_sanity_flag = 'ratio_exceeded'
                total_cost_basis_from_holdings = 0.0
                # Zero the per-account basis too so account-level return doesn't lie
                cost_basis_per_account = {k: 0.0 for k in cost_basis_per_account}
                for _acc_data in by_account.values():
                    _acc_data['total_cost_basis'] = 0.0

        # ── Realized capital gains via FIFO lot matching ─────────────────────
        # Walks the same 5y transaction ledger to compute per-period realized gains,
        # ST vs LT classification, and per-ticker breakdown.
        try:
            from realized_gains_service import compute_realized_gains
            realized_gains = compute_realized_gains(inv_txns, inv_sec_map)
        except Exception as _rg_e:
            logging.warning(f"Realized gains computation failed for {user_id}: {_rg_e}")
            from realized_gains_service import empty_realized_gains
            realized_gains = empty_realized_gains()

        # ── Tax-loss harvesting opportunities ────────────────────────────────
        # Replay the same FIFO ledger to identify currently-open lots that are
        # underwater vs today's market price. Persists per-lot so the user can
        # see exactly which shares to consider selling.
        try:
            from tax_loss_service import find_harvest_opportunities
            # Build {ticker → {current_price}} from new_assets we already priced
            _price_map = {
                (a.ticker or '').upper(): {'current_price': a.current_price or 0}
                for a in new_assets if a.ticker and (a.current_price or 0) > 0
            }
            tax_loss_harvest = find_harvest_opportunities(inv_txns, inv_sec_map, _price_map)
        except Exception as _tlh_e:
            logging.warning(f"Tax-loss harvest computation failed for {user_id}: {_tlh_e}")
            from tax_loss_service import empty_harvest_result
            tax_loss_harvest = empty_harvest_result()

        investment_history = {
            'current_value': round(total_current_value, 2),
            'total_cost_basis': round(total_cost_basis_from_holdings, 2),
            'earliest_date': earliest_txn_date,
            'transaction_count': len(inv_txns),
            'total_fees': round(total_fees, 2),
            'periods': {pk: {k: round(v, 2) for k, v in pdata.items()} for pk, pdata in periods.items()},
            'by_account': by_account,
            'benchmarks': benchmarks,
            'period_returns': period_returns,
            'period_returns_coverage': period_returns_coverage,
            'basis_sanity_flag': basis_sanity_flag,
            'realized_gains': realized_gains,
            'tax_loss_harvest': tax_loss_harvest,
        }
        logging.info(f"Investment history for {user_id}: txns={len(inv_txns)}, accounts={len(by_account)}, periods={list(periods.keys())}")

        # NOTE: the historical-snapshot backfill is NOT run here. It used to run per
        # Plaid item, which anchored it to a single institution's holdings and
        # under-counted users with accounts at multiple brokerages. The caller
        # (api.plaid_sync) now runs it ONCE against the COMBINED holdings after all
        # items sync. We return this item's inv_txns + securities so the caller can
        # build the combined transaction ledger.
        return (new_assets, new_retirement_accounts, new_transactions, new_debts,
                new_paystubs, new_incomes, synced_account_ids, investment_history,
                inv_txns, inv_sec_map)
    except Exception as e:
        import traceback
        print(f"CRITICAL SYNC ERROR: {e}")
        print(traceback.format_exc())
        raise e

