from price_service import get_current_price
from tax_logic import calculate_federal_tax, calculate_state_tax, calculate_fica_tax, calculate_ltcg_tax
from models import User, Income, Asset, Debt, AssetType, RetirementAccount, AccountType, Insurance, InsuranceFrequency, Paystub, IncomeType
from datetime import datetime


def _realized_gains_for_year(realized_gains, year):
    """
    Extract calendar-year ST/LT realized gains from the realized_gains payload.
    Falls back to YTD periods data when by_year is missing (older persisted data).
    Returns dict with 'st', 'lt', 'count'.
    """
    if not realized_gains or not isinstance(realized_gains, dict):
        return {'st': 0.0, 'lt': 0.0, 'count': 0}

    # Preferred path: by_year (added with Phase C)
    by_year = realized_gains.get('by_year') or {}
    yr_str = str(year)
    if yr_str in by_year:
        return {
            'st': float(by_year[yr_str].get('st', 0) or 0),
            'lt': float(by_year[yr_str].get('lt', 0) or 0),
            'count': int(by_year[yr_str].get('count', 0) or 0),
        }

    # Fallback: only return current-year YTD if requested year matches today
    current_year = datetime.now().year
    if year == current_year:
        ytd = (realized_gains.get('periods') or {}).get('ytd', {}) or {}
        return {
            'st': float(ytd.get('st', 0) or 0),
            'lt': float(ytd.get('lt', 0) or 0),
            'count': int(ytd.get('count', 0) or 0),
        }

    return {'st': 0.0, 'lt': 0.0, 'count': 0}


def calculate_net_worth(user: User, incomes: list[Income], assets: list[Asset], debts: list[Debt], retirement_accounts: list[RetirementAccount] = [], insurances: list[Insurance] = [], paystubs: list[Paystub] = []):
    """
    Calculates the real-time net worth for a user with safety for None values.
    """
    total_assets_market_value = 0
    for asset in assets:
        shares = float(asset.shares or 0)
        cost_basis = float(asset.cost_basis or 0)
        
        is_cash_ticker = asset.ticker in ['CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX', 'TMSXX', 'VBTIX', 'VUSXX', 'SNSXX', 'FZFXX']
        if asset.asset_type in [AssetType.CASH, AssetType.HOUSING, AssetType.SAVINGS, AssetType.CHECKING, AssetType.HIGH_YIELD_SAVINGS] or is_cash_ticker:
            total_assets_market_value += shares
        else:
            price_data = get_current_price(asset.ticker)
            current_price = price_data.get('current_price') if isinstance(price_data, dict) else None
            if current_price is not None and isinstance(current_price, (int, float)) and current_price > 0:
                total_assets_market_value += (current_price * shares)
            elif shares > 0:
                total_assets_market_value += (cost_basis * shares)
            # If shares is 0, we don't add anything (value is 0)

    total_debts = sum(debt.remaining_balance for debt in debts)
    
    total_annual_insurance = 0
    for ins in insurances:
        amount = float(ins.amount or 0)
        if ins.frequency == InsuranceFrequency.MONTHLY:
            total_annual_insurance += amount * 12
        elif ins.frequency == InsuranceFrequency.EVERY_6_MONTHS:
            total_annual_insurance += amount * 2
        elif ins.frequency == InsuranceFrequency.YEARLY:
            total_annual_insurance += amount

    current_year = datetime.now().year
    tax_years = [current_year - 1, current_year]
    
    employment_type_name = getattr(user, 'employment_type', None)
    if employment_type_name and hasattr(employment_type_name, 'name'):
        employment_type_name = employment_type_name.name

    tax_info = {}
    for year in tax_years:
        year_incomes = [inc for inc in incomes if getattr(inc, 'year', current_year) == year]
        year_paystubs = [p for p in paystubs if int(p.date[:4]) == year]
        
        # Calculate total taxes paid (withheld) across all paystubs
        total_taxes_paid = sum(float(p.tax_withheld or 0) for p in year_paystubs)

        # Plaid auto-detected paystubs have is_net_primary=True, meaning gross_amount
        # is actually the NET deposit (we have no gross figure). Taxing a net deposit
        # produces a wildly wrong estimate, so exclude these from gross calculation.
        gross_stubs = [p for p in year_paystubs if not getattr(p, 'is_net_primary', False)]
        net_primary_stubs = [p for p in year_paystubs if getattr(p, 'is_net_primary', False)]
        gross_income_from_stubs = sum(float(p.gross_amount or 0) for p in gross_stubs)

        # Investment and other Income
        other_gross_income = sum(float(inc.amount or 0) for inc in year_incomes if not getattr(inc, 'is_net', False))
        other_net_income = sum(float(inc.amount or 0) for inc in year_incomes if getattr(inc, 'is_net', False))

        # Flag: if ALL payroll data is net-primary and there's no manually-entered gross income,
        # we cannot estimate taxes — the tax figure would be nonsense.
        has_net_only_income = (len(gross_stubs) == 0 and len(net_primary_stubs) > 0 and other_gross_income == 0)

        # Net deposits from Plaid-detected paychecks (is_net_primary=True). These are already
        # post-tax, so they are NOT included in gross_income for tax estimation, but they DO
        # represent real cash flow that should appear in the dashboard income figure.
        net_primary_deposits = sum(float(p.gross_amount or 0) for p in net_primary_stubs)

        gross_income = other_gross_income + gross_income_from_stubs
        
        retirement_deductions = 0
        for ra in retirement_accounts:
            if ra.account_type in [AccountType.TRADITIONAL_IRA, AccountType.K401, AccountType.B403]:
                if year == (current_year - 1):
                    retirement_deductions += float(ra.contributions_2025 or 0)
                elif year == current_year:
                    retirement_deductions += float(ra.contributions_2026 or 0)
        
        business_deductions = float(getattr(user, 'business_deductions', 0)) if employment_type_name in ['CONTRACTOR', 'BUSINESS_OWNER'] else 0.0

        # ── Realized capital gains for this tax year ──────────────────────────
        # Pulled from the user's most recent investment_history sync. ST gains
        # are taxed as ordinary income; LT gains get preferential rates.
        realized_gains_payload = getattr(user, 'investment_history', None) or {}
        realized_gains_payload = realized_gains_payload.get('realized_gains') if isinstance(realized_gains_payload, dict) else None
        rg_year = _realized_gains_for_year(realized_gains_payload, year)
        st_gains = rg_year['st']
        lt_gains = rg_year['lt']

        # Federal: ST gains added to ordinary income; LT gains taxed separately at LTCG rates.
        # State: most states (incl. CA) tax both ST and LT as ordinary income — no preferential treatment.
        ordinary_income_for_fed = gross_income + st_gains
        ordinary_taxable_for_fed = max(0, ordinary_income_for_fed - retirement_deductions - total_annual_insurance - business_deductions)
        # Backward-compat name kept for downstream consumers that still expect "taxable_income"
        taxable_income = ordinary_taxable_for_fed

        fed_ordinary_tax = calculate_federal_tax(ordinary_taxable_for_fed, user.filing_status.value, year)
        fed_ltcg_tax = calculate_ltcg_tax(lt_gains, ordinary_taxable_for_fed, user.filing_status.value, year)
        fed_tax = fed_ordinary_tax + fed_ltcg_tax

        # Child Tax Credit is a dollar-for-dollar reduction against federal tax liability
        dependents = int(getattr(user, 'dependents', 0))
        child_tax_credit = dependents * 2200
        fed_tax = max(0, fed_tax - child_tax_credit)

        state_taxable_income = max(0, gross_income + st_gains + lt_gains - retirement_deductions - total_annual_insurance - business_deductions)
        state_tax = calculate_state_tax(state_taxable_income, user.state.name, user.filing_status.value, year)
        
        if employment_type_name in ['CONTRACTOR', 'BUSINESS_OWNER']:
            net_earnings = max(0, gross_income - business_deductions)
            se_taxble_income = net_earnings * 0.9235
            fica_tax = se_taxble_income * 0.153
        else:
            # FICA only applies to wage income (salary, hourly). Dividends and
            # capital gains are investment income and are not subject to FICA.
            _wage_types = {IncomeType.ANNUAL_SALARY, IncomeType.MONTHLY_SALARY, IncomeType.HOURLY, IncomeType.FIXED_TOTAL}
            fica_wage_base = gross_income_from_stubs + sum(
                float(inc.amount or 0) for inc in year_incomes
                if not getattr(inc, 'is_net', False) and inc.income_type in _wage_types
            )
            fica_tax = calculate_fica_tax(fica_wage_base, user.filing_status.value, year)
        
        tax_info[year] = {
            "gross_income": gross_income,
            "taxable_income": taxable_income,
            "retirement_deductions": retirement_deductions,
            "insurance_deductions": total_annual_insurance,
            "federal_tax": fed_tax,
            "state_tax": state_tax,
            "fica_tax": fica_tax,
            "total_tax": fed_tax + state_tax + fica_tax,
            "total_withheld": total_taxes_paid,
            "net_income_addons": other_net_income,
            "net_primary_deposits": net_primary_deposits,
            "has_net_only_income": has_net_only_income,
            # Realized capital gains breakdown (Phase C)
            "realized_st_gains": round(st_gains, 2),
            "realized_lt_gains": round(lt_gains, 2),
            "realized_sell_count": rg_year['count'],
            "fed_ltcg_tax": round(fed_ltcg_tax, 2),
            "fed_ordinary_tax": round(max(0, fed_ordinary_tax - child_tax_credit), 2),
        }

    # ARCH-4: Explicit cast for linter safety
    real_time_net_worth = float(total_assets_market_value) - float(total_debts)
    
    current_year_tax = tax_info.get(current_year, {})
    # total_annual_income = gross wage/investment income + manually-entered net income + Plaid
    # net deposits (is_net_primary paystubs). Net deposits are already post-tax so they are
    # added directly to net income rather than being subject to another tax pass.
    total_annual_income = (
        current_year_tax.get('gross_income', 0) +
        current_year_tax.get('net_income_addons', 0) +
        current_year_tax.get('net_primary_deposits', 0)
    )
    # For cash-flow purposes, tax only applies to the gross portion (net deposits are already net).
    monthly_post_tax_income = (
        current_year_tax.get('gross_income', 0) +
        current_year_tax.get('net_income_addons', 0) -
        current_year_tax.get('total_tax', 0) +
        current_year_tax.get('net_primary_deposits', 0)
    ) / 12

    return {
        "total_assets_market_value": total_assets_market_value,
        "total_debts": total_debts,
        "real_time_net_worth": real_time_net_worth,
        "total_annual_income": total_annual_income,
        "monthly_post_tax_income": monthly_post_tax_income,
        "tax_details": tax_info
    }

if __name__ == '__main__':
    # Example Usage:
    # from sqlalchemy import create_engine
    # from sqlalchemy.orm import sessionmaker
    # Base.metadata.create_all(engine)
    #
    # # Setup a dummy session and add a user, income, and asset for demonstration
    # # This part requires a running database and session setup
    # print("Run this within a proper application context with a database session.")
    pass
