from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from .account_types import AccountType


class AccountBase(BaseModel):
    name: str
    type: AccountType
    institution: str
    currency: str
    latest_balance: Optional[float] = None


class AccountCreate(AccountBase):
    pass


class AccountRead(AccountBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class TransactionBase(BaseModel):
    account_id: int
    date: date
    description_raw: str
    description_clean: Optional[str] = None
    amount: float
    currency: str
    category: Optional[str] = None
    subcategory: Optional[str] = None


class TransactionCreate(TransactionBase):
    pass


class TransactionRead(TransactionBase):
    id: int
    created_at: datetime
    account: Optional[AccountRead] = None

    model_config = ConfigDict(from_attributes=True)


class TransactionSummary(BaseModel):
    total_income: float
    total_expenses: float
    total_invested: float
    net_flow: float
    savings_rate: float
    net_worth: float


class CategoryExpenseSummary(BaseModel):
    category: str
    total_amount: float


class CategorizationPredictRequest(BaseModel):
    description: str
    amount: Optional[float] = None
    date: Optional[date] = None
    account_type: Optional[str] = None


class CategoryScore(BaseModel):
    category: str
    confidence: float


class CategorizationPrediction(BaseModel):
    category: Optional[str]
    confidence: Optional[float]
    source: str
    top_categories: list[CategoryScore] = []
    normalized_description: str


class CategorizationStatus(BaseModel):
    trained: bool
    trained_at: Optional[str] = None
    labels: list[str] = []
    model_path: Optional[str] = None


class CategorizationTrainResponse(BaseModel):
    trained: bool
    samples: int
    labels: list[str]
    accuracy: Optional[float] = None
    macro_f1: Optional[float] = None
    heldout_samples: int = 0
    saved_to: Optional[str] = None


class TransactionCategoryUpdate(BaseModel):
    category: str
    retrain: bool = False


class TransactionCategoryUpdateResponse(BaseModel):
    transaction: TransactionRead
    training: Optional[CategorizationTrainResponse] = None
