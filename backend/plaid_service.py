import os
import re
import plaid
from plaid.api import plaid_api
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
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
            "client_name": "Financial HQ",
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
    """
    try:
        request = LinkTokenCreateRequest(
            products=[Products('transactions')],
            optional_products=[Products('investments'), Products('liabilities'), Products('identity')],
            client_name="Financial HQ",
            country_codes=[CountryCode('US')],
            language='en',
            user=LinkTokenCreateRequestUser(client_user_id=str(user_id)),
            access_token=access_token # This triggers 'update' mode
        )
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
            elif subtype in ['hsa', 'cd', 'money market']: atype = AssetType.HIGH_YIELD_SAVINGS
            
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
                
                # Naming cleanup: avoid 'Ultimate Rewards' as the primary display name
                display_name = acc['name']
                official_name = acc.get('official_name') or acc['name']
                mask = acc.get('mask')
                
                def clean_debt_name(s, m):
                    if not s: return ""
                    
                    # Strip specific generic or noise phrases
                    noise = ['ultimate rewards', 'ultimate', 'rewards', 'points', 'cash back', 'preferred member', 'signature', 'visa', 'mastercard', 'amex']
                    for kw in noise:
                        s = re.sub(rf'\b{kw}\b', '', s, flags=re.IGNORECASE)
                    
                    # Strip common registered/trademark symbols
                    s = s.replace('®', '').replace('™', '').strip()

                    # Strip mask if present
                    if m:
                        s = s.replace(f"-{m}", "").replace(f" {m}", "").replace(m, "")
                    
                    # Clean up double spaces or trailing dashes
                    s = re.sub(r'\s+', ' ', s).strip(' -')
                    return s.upper()


                c_display = clean_debt_name(display_name, mask)
                c_official = clean_debt_name(official_name, mask)
                
                # Check for specific product identifiers in any field
                product_keywords = ['sapphire', 'reserve', 'preferred', 'gold', 'platinum', 'business', 'ink', 'freedom', 'active cash']
                
                # If official name has the brand/product but display doesn't, use official
                found_product = next((kw for kw in product_keywords if kw in official_name.lower()), None)
                if found_product and found_product not in c_display.lower():
                    display_name = c_official
                else:
                    display_name = c_display

                # 3. IF THE NAME IS STILL GENERIC (e.g. "CREDIT CARD"), prefix with institution
                if display_name.lower() in ['credit card', 'card', 'visa', 'mastercard']:
                    # Prefer the institution_name passed in from the PlaidItem record
                    if institution_name:
                        prefix = institution_name.replace(' Bank', '').replace(' Financial', '').strip()
                        display_name = f"{prefix} {display_name}"
                    elif 'chase' in official_name.lower():
                        display_name = f"Chase {display_name}"
                    elif 'vanguard' in official_name.lower():
                        display_name = f"Vanguard {display_name}"
                    elif 'amex' in official_name.lower() or 'american express' in official_name.lower():
                        display_name = f"Amex {display_name}"
                
                # Special Case: user's specific examples
                for product in ['Sapphire', 'Reserve', 'Preferred']:
                    if product.lower() in official_name.lower() and product.lower() not in display_name.lower():
                        display_name = f"{display_name} {product}".replace("  ", " ").strip()


                new_debts.append(Debt(
                    name=display_name,
                    initial_amount=balance, 
                    amount_paid=0.0,
                    monthly_payment=acc['balances'].get('minimum_payment', 0) or 0,
                    interest_rate=interest_rate,
                    plaid_account_id=acc['account_id'],
                    institution_name=display_name,
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
                # VMFXX/SPAXX etc. are excluded from current_value (end), so including
                # them in invested inflates net_flow and distorts Modified Dietz return.
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

        # ── Reconstruct period-specific portfolio returns (best-effort) ──
        # Walk the 5yr transaction ledger to compute shares held at each period start,
        # then price those positions via yfinance to get a true holding-period return %.
        period_returns = {}
        try:
            import yfinance as _yf
            import pandas as _pd
            from datetime import datetime as _dt_cls

            CASH_LIKE = {
                'CUR:USD', 'USD', 'CASH', 'VMFXX', 'SPAXX', 'FDRXX',
                'SWVXX', 'TMSXX', 'SNSXX', 'FZFXX', 'VBTIX', 'VUSXX',
            }

            # Build share ledger: (date, ticker, delta) from buy/sell transactions only
            share_ledger = []
            for _txn in inv_txns:
                _sec_id = _txn.get('security_id')
                if not _sec_id:
                    continue
                _sec = inv_sec_map.get(_sec_id) or {}
                _ticker = (_sec.get('ticker_symbol') or '').upper().strip()
                if not _ticker or _ticker in CASH_LIKE:
                    continue

                _ttype = (_txn.get('type') or '').lower()
                _stype = (_txn.get('subtype') or '').lower()
                _is_buy = _ttype == 'buy' or _stype == 'buy'
                _is_sell = _ttype == 'sell' or _stype == 'sell'
                if not _is_buy and not _is_sell:
                    continue

                _qty = abs(float(_txn.get('quantity') or 0))
                if _qty < 0.0001:
                    continue

                _dv = _txn.get('date')
                if not _dv:
                    continue
                if hasattr(_dv, 'date'):
                    _dobj = _dv.date()
                elif isinstance(_dv, str):
                    _dobj = _dt_cls.strptime(_dv[:10], '%Y-%m-%d').date()
                else:
                    _dobj = _dv

                share_ledger.append((_dobj, _ticker, _qty if _is_buy else -_qty))

            share_ledger.sort(key=lambda x: x[0])

            if share_ledger and total_current_value > 100:
                # Compute cumulative shares at each period start (only txns BEFORE that date)
                period_start_snaps = {}
                for _pk, _start in _period_starts.items():
                    if _start is None:
                        continue
                    _cum = {}
                    for (_td, _tk, _delta) in share_ledger:
                        if _td < _start:
                            _cum[_tk] = _cum.get(_tk, 0.0) + _delta
                    # Keep only open long positions
                    period_start_snaps[_pk] = {t: s for t, s in _cum.items() if s > 0.001}

                _all_hist_tickers = list({t for snap in period_start_snaps.values() for t in snap})

                if _all_hist_tickers:
                    _tickers_str = ' '.join(_all_hist_tickers)
                    _raw = _yf.download(_tickers_str, period='5y', progress=False, auto_adjust=True)

                    # Normalise to a DataFrame of Close prices keyed by ticker
                    if isinstance(_raw.columns, _pd.MultiIndex):
                        _close_df = _raw['Close']
                    elif len(_all_hist_tickers) == 1:
                        _close_df = _raw[['Close']].rename(columns={'Close': _all_hist_tickers[0]})
                    else:
                        _close_df = _raw.get('Close', _raw)

                    # Strip timezone so Timestamp comparisons work
                    if getattr(_close_df.index, 'tz', None) is not None:
                        _close_df.index = _close_df.index.tz_convert(None)

                    for _pk, _snap in period_start_snaps.items():
                        if not _snap:
                            continue
                        _start_ts = _pd.Timestamp(_period_starts[_pk])
                        _val_at_start = 0.0
                        _priced = 0

                        for _ticker, _shares in _snap.items():
                            if _ticker not in _close_df.columns:
                                continue
                            _series = _close_df[_ticker].dropna()
                            _after = _series[_series.index >= _start_ts]
                            if not _after.empty:
                                _price = float(_after.iloc[0])
                            else:
                                _before = _series[_series.index < _start_ts]
                                if _before.empty:
                                    continue
                                _price = float(_before.iloc[-1])
                            _val_at_start += _shares * _price
                            _priced += 1

                        _coverage = _priced / len(_snap) if _snap else 0
                        if _coverage >= 0.75 and _val_at_start > 100:
                            # Modified Dietz: accounts for cash flows during the period.
                            # net_flow ≈ invested − proceeds − dividends (proxy for external flow,
                            # since Plaid doesn't reliably distinguish deposits from internal cash).
                            # If user invested $25k more than they sold this period, naive (end-start)/start
                            # treats the new $25k as growth — Mod Dietz removes that artifact.
                            _pdata = periods.get(_pk, {})
                            _net_flow = (_pdata.get('invested', 0) or 0) - (_pdata.get('proceeds', 0) or 0) - (_pdata.get('dividends', 0) or 0)
                            _denom = _val_at_start + 0.5 * _net_flow
                            if _denom > 100:  # guard against degenerate denominators
                                _ret = (total_current_value - _val_at_start - _net_flow) / _denom * 100
                                period_returns[_pk] = round(_ret, 2)

        except Exception as _pr_e:
            logging.warning(f"Period return reconstruction skipped: {_pr_e}")

        # ── Weighted-ticker fallback for missing period returns ────────────
        # The ledger-reconstruction path above requires ≥75% price coverage at each period
        # start — it fails silently when a ticker has no history (delisted, recent IPO, or
        # a mutual fund yfinance can't resolve). Without this fallback, the UI falls back to
        # "All-Time Return" when the user clicks 1W/1M/etc., which is surprising and wrong.
        #
        # Strategy: for each period missing from period_returns, compute a value-weighted
        # average of each current holding's own period return (using yfinance 5y history).
        # Less precise than the reconstruction (ignores intra-period buys/sells), but a
        # meaningful approximation — what a "buy and hold the current basket" return would
        # have been over that period.
        try:
            _missing_periods = [p for p in ('1w', '1m', 'ytd', '1y', '2y', '5y') if p not in period_returns]
            if _missing_periods and total_current_value > 100:
                from price_service import get_multi_period_returns as _gmpr

                # Build per-ticker current market value from new_assets (excluding cash-likes)
                _ticker_mv = {}
                _CASH_LIKE = {
                    'CUR:USD', 'USD', 'CASH', 'VMFXX', 'SPAXX', 'FDRXX',
                    'SWVXX', 'TMSXX', 'SNSXX', 'FZFXX', 'VBTIX', 'VUSXX',
                }
                for _a in new_assets:
                    _t = (_a.ticker or '').upper().strip()
                    if not _t or _t in _CASH_LIKE:
                        continue
                    _px = _a.current_price or 0
                    _mv = max(0.0, (_a.shares or 0) * _px)
                    if _mv > 0:
                        _ticker_mv[_t] = _ticker_mv.get(_t, 0.0) + _mv

                if _ticker_mv:
                    # Fetch multi-period returns per ticker in parallel, capped at 8s total
                    _per_ticker_returns = {}
                    with ThreadPoolExecutor(max_workers=5) as _tex:
                        _tfutures = {_tex.submit(_gmpr, t): t for t in _ticker_mv}
                        for _tf in as_completed(_tfutures):
                            _t = _tfutures[_tf]
                            try:
                                _per_ticker_returns[_t] = _tf.result(timeout=8.0) or {}
                            except Exception:
                                _per_ticker_returns[_t] = {}

                    _total_mv = sum(_ticker_mv.values())
                    for _pk in _missing_periods:
                        _w_sum = 0.0
                        _w_weight = 0.0
                        for _t, _mv in _ticker_mv.items():
                            _r = _per_ticker_returns.get(_t, {}).get(_pk)
                            if _r is not None:
                                _w_sum += _r * _mv
                                _w_weight += _mv
                        # Require ≥50% of portfolio value to have a valid return for this period
                        if _w_weight > 0 and _total_mv > 0 and (_w_weight / _total_mv) >= 0.5:
                            period_returns[_pk] = round(_w_sum / _w_weight, 2)
                            logging.info(f"[Sync {user_id}] Fallback period return {_pk}: {period_returns[_pk]}% (weighted {_w_weight/_total_mv*100:.0f}% coverage)")
        except Exception as _fb_e:
            logging.warning(f"Weighted-ticker period return fallback failed: {_fb_e}")

        # Fetch multi-period benchmark returns for S&P 500, Nasdaq, Dow Jones (best-effort)
        benchmarks = {}
        try:
            from price_service import get_multi_period_returns
            benchmark_tickers = {'spy': 'SPY', 'qqq': 'QQQ', 'dia': 'DIA'}
            with ThreadPoolExecutor(max_workers=3) as _bex:
                bfutures = {_bex.submit(get_multi_period_returns, t): k for k, t in benchmark_tickers.items()}
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

        total_current_value = sum(market_value_per_account.values())
        total_cost_basis_from_holdings = sum(cost_basis_per_account.values())

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
            'basis_sanity_flag': basis_sanity_flag,
            'realized_gains': realized_gains,
        }
        logging.info(f"Investment history for {user_id}: txns={len(inv_txns)}, accounts={len(by_account)}, periods={list(periods.keys())}")

        return new_assets, new_retirement_accounts, new_transactions, new_debts, new_paystubs, new_incomes, synced_account_ids, investment_history
    except Exception as e:
        import traceback
        print(f"CRITICAL SYNC ERROR: {e}")
        print(traceback.format_exc())
        raise e

