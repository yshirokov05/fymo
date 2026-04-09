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

class CheckStatus(enum.Enum):
    PENDING = "pending"
    CLEARED = "cleared"

class EmploymentType(enum.Enum):
    W2 = "W2"
    CONTRACTOR = "1099"
    BUSINESS_OWNER = "business_owner"

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
    DIVIDENDS = "dividends"
    CAPITAL_GAINS = "capital_gains"

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
    employment_type: EmploymentType = EmploymentType.W2
    business_deductions: float = 0.0
    dependents: int = 0
    ignored_subscription_merchants: List[str] = field(default_factory=list)
    manual_subscription_merchants: List[str] = field(default_factory=list)
    ignored_flexible: List[str] = field(default_factory=list)
    excluded_paystub_ids: List[str] = field(default_factory=list)
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None

@dataclass
class Income:
    income_type: IncomeType
    amount: float
    monthly_income: Optional[float] = None
    hourly_wage: Optional[float] = None
    hours_worked: Optional[float] = None
    hourly_type: Optional[HourlyType] = HourlyType.REPEATING
    year: int = 2026
    description: Optional[str] = None
    is_net: bool = False

@dataclass
class Insurance:
    name: str
    amount: float
    frequency: InsuranceFrequency = InsuranceFrequency.MONTHLY
    insurance_type: Optional[str] = "Auto" # "Auto", "Health", "Life", etc.
    deductible: Optional[float] = 0.0
    coverage_summary: Optional[str] = None # Detailed rundown of benefits
    advisor_observations: Optional[str] = None # AI comparisons and observations
    last_audit_date: Optional[str] = field(default_factory=lambda: datetime.now().isoformat())

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
    benefits: Optional[str] = None
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
    pending_transaction_id: Optional[str] = None

@dataclass
class Paystub:
    id: str
    user_id: str
    date: str
    gross_amount: float
    net_amount: Optional[float] = None
    tax_withheld: Optional[float] = None
    employer: Optional[str] = None
    is_net_primary: bool = False

@dataclass
class CustomRule:
    merchant_name: str
    category: str
    user_id: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))

@dataclass
class OutstandingCheck:
    id: str
    user_id: str
    amount: float
    payee: str
    date_written: str
    status: CheckStatus = CheckStatus.PENDING
    plaid_transaction_id: Optional[str] = None

@dataclass
class UserMemory:
    fact_id: str
    user_id: str
    category: str  # e.g., 'Goal', 'Habit', 'Constraint', 'EconBackground'
    content: str
    confidence_score: float = 1.0
    last_updated: str = field(default_factory=lambda: datetime.now().isoformat())
