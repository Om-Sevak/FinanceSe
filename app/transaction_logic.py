from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING, Union

from .account_types import (
    CASH_ACCOUNT_TYPES,
    CREDIT_ACCOUNT_TYPES,
    INVESTMENT_ACCOUNT_TYPES,
    parse_account_type,
)
from .category_labels import canonicalize_category, is_investment_category, is_transfer_category

if TYPE_CHECKING:  # pragma: no cover
    from . import models

Number = Union[float, Decimal]


@dataclass
class TransactionClassification:
    amount: float
    counts_income: bool = False
    counts_expense: bool = False
    counts_invested: bool = False
    is_transfer: bool = False


def normalize_transaction_amount(amount: Number, account_type_value: str, category: str | None) -> Number:
    """
    Enforce sign conventions:
    - credit account activity defaults to negative (outflow)
    - credit transfers stay positive (they represent payments)
    """
    account_type = parse_account_type(account_type_value)
    category_label = canonicalize_category(category)
    if account_type not in CREDIT_ACCOUNT_TYPES or amount is None:
        return amount

    magnitude = abs(amount)
    if category_label and is_transfer_category(category_label):
        return magnitude
    return -magnitude


def classify_transaction(txn: "models.Transaction", account_type_value: str) -> TransactionClassification:
    account_type = parse_account_type(account_type_value)
    amount = float(txn.amount or 0)
    category = canonicalize_category(txn.category)

    if amount == 0:
        return TransactionClassification(amount=0.0)

    if is_transfer_category(category):
        return TransactionClassification(amount=amount, is_transfer=True)

    if account_type in INVESTMENT_ACCOUNT_TYPES or is_investment_category(category):
        return TransactionClassification(amount=abs(amount), counts_invested=True)

    if account_type in CASH_ACCOUNT_TYPES:
        if amount > 0:
            return TransactionClassification(amount=amount, counts_income=True)
        if amount < 0:
            return TransactionClassification(amount=amount, counts_expense=True)

    elif account_type in CREDIT_ACCOUNT_TYPES:
        return TransactionClassification(amount=amount, counts_expense=True)

    else:
        if amount > 0:
            return TransactionClassification(amount=amount, counts_income=True)
        if amount < 0:
            return TransactionClassification(amount=amount, counts_expense=True)

    return TransactionClassification(amount=amount)
