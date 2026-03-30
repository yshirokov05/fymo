import os
import plaid
from plaid.api import plaid_api
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.investments_holdings_get_request import InvestmentsHoldingsGetRequest
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions
from plaid.model.liabilities_get_request import LiabilitiesGetRequest
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from models import Asset, AssetType, RetirementAccount, AccountType, Transaction, Debt, Paystub, TaxTreatment, DebtType
from datetime import datetime, timedelta
from dotenv import load_dotenv
import logging

load_dotenv()

PLAID_CLIENT_ID = os.getenv('PLAID_CLIENT_ID', '').strip()
PLAID_SECRET = os.getenv('PLAID_SECRET', '').strip()
PLAID_ENV = os.getenv('PLAID_ENV', 'sandbox').strip()
PLAID_REDIRECT_URI = os.getenv('PLAID_REDIRECT_URI', '').strip() # Required for Production OAuth

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



def categorize_transaction(name, plaid_categories, custom_rules=None):
    """
    Robust categorization based on merchant name, Plaid categories, and user Custom Rules.
    """
    name = name.lower()
    
    # 0. User Custom Rules Overrides (Highest Priority)
    if custom_rules:
        for rule in custom_rules:
            if rule.merchant_name.lower() in name or name in rule.merchant_name.lower():
                return rule.category
                
    # 1. Ignore List (Transfers, Payments, Investments)
    if any(k in name for k in ['vanguard', 'chase card', 'payment to', 'zelle', 'stradavarius', 'moose llc', 'transfer', 'funding']):
        return "Ignore"

    pcats = [c.lower() for c in plaid_categories] if plaid_categories else []
    
    # 2. Groceries
    if any(k in name for k in ['safeway', 'kroger', 'whole foods', 'trader joe', 'albertsons', 'grocer', 'costco', 'target', 'walmart', 'aldi', 'publix']):
        return "Groceries"
        
    # 3. Eating Out
    if any(k in name for k in ['dining', 'restaurant', 'mcdonald', 'starbucks', 'coffee', 'uber eats', 'doordash', 'pizza', 'taco bell', 'chipotle', 'burger king', 'subway', 'wendy', 'dunkin', 'ramen', 'grill', 'wings', 'cafe', 'baguette', 'eataly', 'in-n-out', 'mountain mikes']):
        return "Eating Out"
    if 'food' in pcats or 'dining' in pcats:
        return "Eating Out"
        
    # 4. Transportation (includes Parking and Gas)
    if any(k in name for k in ['parking', 'ace parking', 'uber', 'lyft', 'transit', 'bus', 'train', 'subway', 'metro', 'clippercard', 'caltrain', 'bart', 'shell', 'chevron', '7-eleven', 'gas', 'fuel', 'mobil', 'exxon', 'arco', 'bp', 'valero', 'speedway', 'quiktrip', 'garage', 'car wash']):
        return "Transportation"
    if 'transport' in pcats or 'travel' in pcats:
        return "Transportation"
        
    # 5. Personal Care
    if any(k in name for k in ['hair', 'nail', 'salon', 'barber', 'massage', 'spa', 'massage envy', 'great clips', 'supercuts', 'sephora', 'ulta', 'cvs', 'walgreens', 'rite aid']):
        return "Personal Care"
    if 'personal care' in pcats or 'health care' in pcats:
        return "Personal Care"
        
    # 6. Entertainment & Services
    if any(k in name for k in ['paramount', 'netflix', 'hulu', 'disney+', 'spotify', 'apple.com/bill', 'youtube premium', 'hbo', 'max', 'openai', 'chatgpt', 'martial arts', 'gym']):
        return "Entertainment"
    if 'entertainment' in pcats or 'recreation' in pcats:
        return "Entertainment"
        
    # 7. Housing & Utilities
    if 'rent' in pcats or 'mortgage' in pcats:
        return "Housing"
    if 'utilities' in pcats or any(k in name for k in ['pge', 'comcast', 'at&t', 'verizon', 'water bill', 'electric bill']):
        return "Utilities"

    return pcats[0].capitalize() if pcats else "Other"

def sync_plaid_data(access_token, user_id, custom_rules=None):
    """
    Fetches account balances, investment holdings, and transactions from Plaid.
    Returns new_assets, new_retirement_accounts, new_transactions, new_debts.
    """
    try:
        logging.info(f"Syncing data for user: {user_id}")
        # 1. Get Accounts (for Cash/Bank balances)
        accounts_request = AccountsGetRequest(access_token=access_token)
        accounts_response = client.accounts_get(accounts_request).to_dict()
        synced_account_ids = [acc['account_id'] for acc in accounts_response.get('accounts', [])]
        logging.info(f"Retrieved {len(accounts_response.get('accounts', []))} accounts from Plaid.")
        
        # 2. Get Investment Holdings
        holdings_response = {'holdings': [], 'securities': []}
        try:
            holdings_request = InvestmentsHoldingsGetRequest(access_token=access_token)
            holdings_response = client.investments_holdings_get(holdings_request).to_dict()
        except Exception as e:
            logging.warning(f"Note: Investments product may not be supported for this item: {e}")

        # 3. Get Transactions (Last 30 days for budgeting)
        trans_response = {'transactions': []}
        try:
            end_date = datetime.now().date()
            start_date = end_date - timedelta(days=30)
            trans_request = TransactionsGetRequest(
                access_token=access_token,
                start_date=start_date,
                end_date=end_date,
            )
            trans_response = client.transactions_get(trans_request).to_dict()
        except Exception as e:
            logging.warning(f"Note: Transactions product may not be supported for this item: {e}")
        
        # 4. Get Liabilities (for Credit Card interest rates)
        credit_liabilities = {}
        try:
            liab_request = LiabilitiesGetRequest(access_token=access_token)
            liab_response = client.liabilities_get(liab_request).to_dict()
            # Map by account_id for easy lookup
            for credit in liab_response.get('liabilities', {}).get('credit', []):
                credit_liabilities[credit['account_id']] = credit
        except Exception as e:
            logging.warning(f"Note: Liabilities product may not be supported for this item: {e}")
        
        new_assets = []
        new_retirement_accounts = []
        new_transactions = []
        new_debts = []
        new_paystubs = []
        
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
                
                # Naming cleanup: avoid 'Ultimate Rewards' as the primary display name
                import re
                display_name = acc['name']
                official_name = acc.get('official_name') or acc['name']
                mask = acc.get('mask')
                
                # Helper to strip rewards-related strings and mask
                def clean_debt_name(s, m):
                    if not s: return ""
                    # Strip rewards keywords - be careful not to strip product names
                    # 'preferred' and 'reserve' are product tiers, keep them.
                    keywords = ['ultimate rewards', 'ultimate', 'rewards', 'points', 'cash back']
                    for kw in keywords:
                        s = re.sub(rf'\b{kw}\b', '', s, flags=re.IGNORECASE)
                    # Strip mask if present
                    if m:
                        s = s.replace(f"-{m}", "").replace(f" {m}", "").replace(m, "")
                    # Strip special chars and extra whitespace
                    s = s.replace('®', '').replace('™', '').strip()
                    # Clean up double spaces or trailing dashes
                    s = re.sub(r'\s+', ' ', s).strip(' -')
                    return s

                c_display = clean_debt_name(display_name, mask)
                c_official = clean_debt_name(official_name, mask)
                
                # Check for specific product identifiers in any field
                product_keywords = ['sapphire', 'reserve', 'preferred', 'gold', 'platinum', 'business', 'ink', 'freedom']
                
                # If official name has the brand/product but display doesn't, use official
                found_product = next((kw for kw in product_keywords if kw in official_name.lower()), None)
                if found_product and found_product not in c_display.lower():
                    # Check if official name has "Chase" or "American Express" etc.
                    display_name = c_official
                else:
                    display_name = c_display

                # Final refinement: if it's just "Credit Card" but we know it's Chase (from institution or name)
                if len(display_name) < 12 and 'chase' not in display_name.lower():
                    if 'chase' in official_name.lower() or 'chase' in acc.get('name', '').lower():
                        display_name = f"Chase {display_name}" if display_name.lower() != 'credit card' else "Chase Credit Card"
                
                # Ensure it's not JUST "Chase" or JUST "Credit Card" if better info exists
                if display_name.lower() in ['chase', 'credit card'] and c_official:
                    display_name = c_official
                
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

                if balance < -0.01:
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
        CASH_TICKERS = ['VMFXX', 'SPAXX', 'FDRXX', 'TMSXX', 'CUR:USD', 'CASH', 'USD', 'SWVXX', 'VBTIX']
        market_value_per_account: dict[str, float] = {}
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
                
            # 2. Handle Negative Holdings (Margin)
            if market_value < -0.01:
                debt_amt = abs(market_value)
                plaid_debt_amt = abs(plaid_reported_value)
                print(f"Adding Negative Holding Margin: {ticker} = {debt_amt} (Plaid: {plaid_debt_amt})")
                new_debts.append(Debt(
                    name=f"Margin: {ticker}",
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
                
                if unexplained_margin > 10.0: # 10.0 buffer for rounding/price lag
                    print(f"ADDING MARGIN LOAN DEBT (Unexplained remainder): {unexplained_margin}")
                    new_debts.append(Debt(
                        name=f"Margin Loan: {acc['name']}",
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
                        asset_type=AssetType.STOCK,
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
                if any(kw in name_lower for kw in ['payroll', 'salary', 'gusto', 'adp', 'direct dep']) or 'payroll' in cat_lower:
                    new_paystubs.append(Paystub(
                        id=f"paystub_{t['transaction_id']}",
                        user_id=user_id,
                        date=t_date,
                        gross_amount=abs(amt), # Initially set to net, but flagged as net_primary
                        net_amount=abs(amt),   # This is the actual deposit amount
                        tax_withheld=0.0,
                        employer=t_name if t_name else "Auto-detected Payroll",
                        is_net_primary=True
                    ))
            
        return new_assets, new_retirement_accounts, new_transactions, new_debts, new_paystubs, synced_account_ids
    except Exception as e:
        import traceback
        print(f"CRITICAL SYNC ERROR: {e}")
        print(traceback.format_exc())
        raise e

