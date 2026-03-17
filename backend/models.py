from dataclasses import dataclass, field
from typing import List, Optional, Dict
import enum
from datetime import datetime
import uuid

class FilingStatus(enum.Enum):
    SINGLE = "single"
    MARRIED_FILING_JOINTLY = "married_filing_jointly"
    MARRIED_FILING_SEPARATELY = "married_filing_separately"
    HEAD_OF_HOUSEHOLD = "head_of_household"
    QUALIFYING_WIDOW = "qualifying_widow"

class USState(enum.Enum):
    AL = "Alabama"
    AK = "Alaska"
    AZ = "Arizona"
    AR = "Arkansas"
    CA = "California"
    CO = "Colorado"
    CT = "Connecticut"
    DE = "Delaware"
    FL = "Florida"
    GA = "Georgia"
    HI = "Hawaii"
    ID = "Idaho"
    IL = "Illinois"
    IN = "Indiana"
    IA = "Iowa"
    KS = "Kansas"
    KY = "Kentucky"
    LA = "Louisiana"
    ME = "Maine"
    MD = "Maryland"
    MA = "Massachusetts"
    MI = "Michigan"
    MN = "Minnesota"
    MS = "Mississippi"
    MO = "Missouri"
    MT = "Montana"
    NE = "Nebraska"
    NV = "Nevada"
    NH = "New Hampshire"
    NJ = "New Jersey"
    NM = "New Mexico"
    NY = "New York"
    NC = "North Carolina"
    ND = "North Dakota"
    OH = "Ohio"
    OK = "Oklahoma"
    OR = "Oregon"
    PA = "Pennsylvania"
    RI = "Rhode Island"
    SC = "South Carolina"
    SD = "South Dakota"
    TN = "Tennessee"
    TX = "Texas"
    UT = "Utah"
    VT = "Vermont"
    VA = "Virginia"
    WA = "Washington"
    WV = "West Virginia"
    WI = "Wisconsin"
    WY = "Wyoming"

class IncomeType(enum.Enum):
    HOURLY = "hourly"
    ANNUAL_SALARY = "annual_salary"
    MONTHLY_SALARY = "monthly_salary"
    FIXED_TOTAL = "fixed_total"

class HourlyType(enum.Enum):
    REPEATING = "repeating"
    ONE_TIME = "one_time"

class InsuranceFrequency(enum.Enum):
    MONTHLY = "monthly"
    EVERY_6_MONTHS = "every_6_months"
    YEARLY = "yearly"

class AccountType(enum.Enum):
    ROTH_IRA = "roth_ira"
    TRADITIONAL_IRA = "traditional_ira"
    K401 = "401k"
    B403 = "403b"

class TaxTreatment(enum.Enum):
    TAXABLE = "taxable"
    TAX_DEFERRED = "tax_deferred"
    TAX_EXEMPT = "tax_exempt"

class DebtType(enum.Enum):
    INSTALLMENT = "installment"
    REVOLVING = "revolving"

class AssetType(enum.Enum):
    STOCK = "stock"
    BOND = "bond"
    CASH = "cash"
    HOUSING = "housing"
    SAVINGS = "savings"
    CHECKING = "checking"
    HIGH_YIELD_SAVINGS = "high_yield_savings"
    SALARY = "salary"

@dataclass
class User:
    filing_status: FilingStatus = FilingStatus.SINGLE
    state: USState = USState.CA
    is_authorized: bool = False
    is_subscribed: bool = False
    has_completed_onboarding: bool = False
    custom_categories: List[str] = field(default_factory=list)

@dataclass
class Income:
    income_type: IncomeType
    amount: float
    monthly_income: Optional[float] = None
    hourly_wage: Optional[float] = None
    hours_worked: Optional[float] = None
    hourly_type: Optional[HourlyType] = HourlyType.REPEATING
    year: int = 2026

@dataclass
class Insurance:
    name: str
    amount: float
    frequency: InsuranceFrequency = InsuranceFrequency.MONTHLY

@dataclass
class RetirementAccount:
    id: str
    name: str
    account_type: AccountType
    contributions_2025: float = 0.0
    contributions_2026: float = 0.0

@dataclass
class Asset:
    ticker: str
    shares: float
    cost_basis: float
    asset_type: AssetType = AssetType.STOCK
    total_gain: Optional[float] = None
    retirement_account_id: Optional[str] = None
    plaid_account_id: Optional[str] = None
    institution_name: Optional[str] = None
    last_price_update: Optional[str] = None
    official_name: Optional[str] = None
    tax_treatment: TaxTreatment = TaxTreatment.TAXABLE

@dataclass
class Debt:
    name: str
    initial_amount: float
    amount_paid: float = 0.0
    monthly_payment: Optional[float] = 0.0
    interest_rate: Optional[float] = 0.0
    plaid_account_id: Optional[str] = None
    institution_name: Optional[str] = None
    official_name: Optional[str] = None
    debt_type: DebtType = DebtType.INSTALLMENT

    @property
    def remaining_balance(self) -> float:
        if self.debt_type == DebtType.REVOLVING:
            return self.initial_amount
        return max(0.0, self.initial_amount - self.amount_paid)

@dataclass
class PlaidItem:
    access_token: str
    item_id: str
    institution_name: Optional[str] = None
    last_sync: Optional[str] = None

@dataclass
class Budget:
    id: str
    user_id: str
    category: str
    limit_amount: float
    period: str = "MONTHLY"

@dataclass
class Transaction:
    id: str
    user_id: str
    account_id: str
    amount: float
    date: str
    name: str
    category: Optional[str] = None
    pending: bool = False

@dataclass
class Paystub:
    id: str
    user_id: str
    date: str
    gross_amount: float
    net_amount: Optional[float] = None
    tax_withheld: Optional[float] = None
    employer: Optional[str] = None

@dataclass
class CustomRule:
    merchant_name: str
    category: str
    user_id: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
