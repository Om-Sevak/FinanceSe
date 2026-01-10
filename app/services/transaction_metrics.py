from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable, Sequence

from .. import models, schemas
from ..account_types import CREDIT_ACCOUNT_TYPES, parse_account_type
from ..category_labels import canonicalize_category
from ..transaction_logic import classify_transaction


@dataclass
class AggregateTotals:
    income: float = 0.0
    expenses: float = 0.0
    invested: float = 0.0


def aggregate_transactions(rows: Iterable[tuple[models.Transaction, str]]) -> AggregateTotals:
    totals = AggregateTotals()
    for txn, account_type_value in rows:
        classification = classify_transaction(txn, account_type_value)

        if classification.counts_income:
            totals.income += classification.amount

        if classification.counts_expense:
            expense_amount = classification.amount
            if expense_amount > 0:
                expense_amount = -abs(expense_amount)
            totals.expenses += expense_amount

        if classification.counts_invested:
            totals.invested += classification.amount

    return totals


def build_category_breakdown(rows: Iterable[tuple[models.Transaction, str]]) -> list[schemas.CategoryExpenseSummary]:
    totals: dict[str, float] = defaultdict(float)
    for txn, account_type_value in rows:
        classification = classify_transaction(txn, account_type_value)
        if not classification.counts_expense:
            continue
        category_label = canonicalize_category(txn.category) or "Uncategorized"
        expense_amount = classification.amount
        if expense_amount > 0:
            expense_amount = -abs(expense_amount)
        totals[category_label] += expense_amount

    sorted_totals = sorted(totals.items(), key=lambda item: item[1])
    return [
        schemas.CategoryExpenseSummary(category=category, total_amount=amount)
        for category, amount in sorted_totals
    ]


def filter_transactions_by_kind(
    rows: Iterable[tuple[models.Transaction, str]],
    kind: str,
) -> list[models.Transaction]:
    filtered: list[models.Transaction] = []
    for txn, account_type_value in rows:
        classification = classify_transaction(txn, account_type_value)
        if kind == "investment" and classification.counts_invested:
            filtered.append(txn)
        elif kind == "income" and classification.counts_income:
            filtered.append(txn)
        elif kind == "expense" and classification.counts_expense:
            filtered.append(txn)
    return filtered


def calculate_net_worth(balances: Sequence[tuple[int, str, float | None, float]]) -> float:
    net_worth = 0.0
    for _, account_type_value, latest_balance, txn_sum in balances:
        account_type = parse_account_type(account_type_value)
        balance_value = float(latest_balance) if latest_balance is not None else float(txn_sum or 0)
        if account_type in CREDIT_ACCOUNT_TYPES:
            net_worth -= balance_value
        else:
            net_worth += balance_value
    return net_worth
