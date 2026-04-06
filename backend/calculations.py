from price_service import get_current_price
from tax_logic import calculate_federal_tax, calculate_state_tax, calculate_fica_tax
from models import User, Income, Asset, Debt, AssetType, RetirementAccount, AccountType, Insurance, InsuranceFrequency, Paystub
from datetime import datetime

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
        
        # Include all paystubs for gross calculation, but handle net_primary specifically
        # If net_primary is true, the gross_amount should already be net + withheld.
        gross_income_from_stubs = sum(float(p.gross_amount or 0) for p in year_paystubs)
        
        # Investment and other Income
        other_gross_income = sum(float(inc.amount or 0) for inc in year_incomes if not getattr(inc, 'is_net', False))
        other_net_income = sum(float(inc.amount or 0) for inc in year_incomes if getattr(inc, 'is_net', False))
        
        gross_income = other_gross_income + gross_income_from_stubs
        
        retirement_deductions = 0
        for ra in retirement_accounts:
            if ra.account_type in [AccountType.TRADITIONAL_IRA, AccountType.K401, AccountType.B403]:
                if year == (current_year - 1):
                    retirement_deductions += float(ra.contributions_2025 or 0)
                elif year == current_year:
                    retirement_deductions += float(ra.contributions_2026 or 0)
        
        business_deductions = float(getattr(user, 'business_deductions', 0)) if employment_type_name in ['CONTRACTOR', 'BUSINESS_OWNER'] else 0.0
        
        taxable_income = max(0, gross_income - retirement_deductions - total_annual_insurance - business_deductions)
        
        fed_tax = calculate_federal_tax(taxable_income, user.filing_status.value, year)
        
        # Child Tax Credit is a dollar-for-dollar reduction against federal tax liability
        dependents = int(getattr(user, 'dependents', 0))
        child_tax_credit = dependents * 2200
        fed_tax = max(0, fed_tax - child_tax_credit)

        state_tax = calculate_state_tax(taxable_income, user.state.name, user.filing_status.value, year)
        
        if employment_type_name in ['CONTRACTOR', 'BUSINESS_OWNER']:
            net_earnings = max(0, gross_income - business_deductions)
            se_taxble_income = net_earnings * 0.9235
            fica_tax = se_taxble_income * 0.153
        else:
            fica_tax = calculate_fica_tax(gross_income, user.filing_status.value, year)
        
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
            "net_income_addons": other_net_income
        }

    # ARCH-4: Explicit cast for linter safety
    real_time_net_worth = float(total_assets_market_value) - float(total_debts)
    
    current_year_tax = tax_info.get(current_year, {})
    total_annual_income = current_year_tax.get('gross_income', 0) + current_year_tax.get('net_income_addons', 0)
    monthly_post_tax_income = (total_annual_income - current_year_tax.get('total_tax', 0)) / 12

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
