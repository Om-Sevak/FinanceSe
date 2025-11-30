from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import extract, func
from decimal import Decimal
from .. import models, schemas
from ..database import get_db
from ..account_types import (
    CREDIT_ACCOUNT_TYPES,
    INVESTMENT_ACCOUNT_TYPES,
    parse_account_type,
)
from ..categorization import categorize_transaction, train_from_transactions

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post("", response_model=list[schemas.TransactionRead], status_code=201)
def create_transactions(transactions: list[schemas.TransactionCreate], db: Session = Depends(get_db)):
    if not transactions:
        raise HTTPException(status_code=400, detail="No transactions provided")
    db_transactions = [models.Transaction(**txn.dict()) for txn in transactions]
    db.add_all(db_transactions)
    db.commit()
    for txn in db_transactions:
        db.refresh(txn)
    return db_transactions


@router.get("", response_model=list[schemas.TransactionRead])
def list_transactions(
    account_id: int | None = Query(default=None),
    year: int | None = Query(default=None),
    month: int | None = Query(default=None, ge=1, le=12),
    db: Session = Depends(get_db),
):
    query = db.query(models.Transaction)
    if account_id is not None:
        query = query.filter(models.Transaction.account_id == account_id)
    if year is not None:
        query = query.filter(extract("year", models.Transaction.date) == year)
    if month is not None:
        query = query.filter(extract("month", models.Transaction.date) == month)
    return query.order_by(models.Transaction.date.desc()).all()


@router.get("/summary", response_model=schemas.TransactionSummary)
def get_transaction_summary(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    """
    Get a summary of transactions for a given year and month.
    """
    rows = (
        db.query(models.Transaction, models.Account.type)
        .join(models.Account)
        .filter(
            extract("year", models.Transaction.date) == year,
            extract("month", models.Transaction.date) == month,
        )
        .all()
    )

    total_income = 0.0
    total_expenses = 0.0
    total_invested = 0.0

    for txn, account_type_value in rows:
        account_type = parse_account_type(account_type_value)
        amount = float(txn.amount or 0)
        category_label = (txn.category or "").strip().lower()

        if account_type in CREDIT_ACCOUNT_TYPES:
            if amount > 0:
                effective_amount = -abs(amount)
            else:
                effective_amount = 0.0
        elif account_type in INVESTMENT_ACCOUNT_TYPES:
            continue
        else:
            effective_amount = amount

        if category_label == "investment":
            invested_value = effective_amount if effective_amount != 0 else amount
            total_invested += abs(invested_value)
            continue
        if category_label == "credit payment" and account_type in CREDIT_ACCOUNT_TYPES:
            continue

        if effective_amount > 0:
            total_income += effective_amount
        elif effective_amount < 0:
            total_expenses += effective_amount

    net_flow = total_income + total_expenses

    savings_rate = 0.0
    if total_income > 0:
        savings_rate = (total_income - abs(total_expenses)) / total_income

    balances = (
        db.query(
            models.Account.id,
            models.Account.type,
            models.Account.latest_balance,
            func.coalesce(func.sum(models.Transaction.amount), 0),
        )
        .outerjoin(models.Transaction)
        .group_by(models.Account.id, models.Account.type, models.Account.latest_balance)
        .all()
    )

    net_worth = 0.0
    for _, account_type_value, latest_balance, txn_sum in balances:
        account_type = parse_account_type(account_type_value)
        if latest_balance is not None:
            balance_value = float(latest_balance)
        else:
            balance_value = float(txn_sum or 0)
        if account_type in CREDIT_ACCOUNT_TYPES:
            net_worth -= abs(balance_value)
        else:
            net_worth += balance_value

    return schemas.TransactionSummary(
        total_income=total_income,
        total_expenses=total_expenses,
        total_invested=total_invested,
        net_flow=net_flow,
        savings_rate=savings_rate,
        net_worth=net_worth,
    )


@router.get(
    "/expenses/by-category", response_model=list[schemas.CategoryExpenseSummary]
)
def get_expenses_by_category(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    """
    Get a summary of expenses by category for a given year and month.
    """
    rows = (
        db.query(models.Transaction, models.Account.type)
        .join(models.Account)
        .filter(
            extract("year", models.Transaction.date) == year,
            extract("month", models.Transaction.date) == month,
        )
        .all()
    )

    totals: dict[str, float] = defaultdict(float)
    for txn, account_type_value in rows:
        raw_category = txn.category or "Uncategorized"
        amount = float(txn.amount or 0)
        account_type = parse_account_type(account_type_value)
        category_label = (raw_category or "").strip().lower()

        if category_label == "investment":
            continue
        if category_label == "credit payment" and account_type in CREDIT_ACCOUNT_TYPES:
            continue

        if account_type in CREDIT_ACCOUNT_TYPES:
            if amount > 0:
                amount = -abs(amount)
            else:
                continue
        elif amount >= 0:
            continue

        totals[raw_category] += amount

    sorted_totals = sorted(totals.items(), key=lambda item: item[1])
    return [
        schemas.CategoryExpenseSummary(category=category, total_amount=total)
        for category, total in sorted_totals
    ]


@router.delete("/dev/purge", status_code=204)
def purge_all_transactions(db: Session = Depends(get_db)):
    """
    DEVELOPMENT ONLY: delete every recorded transaction.
    """
    db.query(models.Transaction).delete()
    db.query(models.Account).update({models.Account.latest_balance: None})
    db.commit()
    return None


@router.post("/dev/re-categorize", status_code=200)
def recategorize_transactions(db: Session = Depends(get_db)):
    """
    DEVELOPMENT ONLY: re-run categorization rules for all transactions.
    """
    transactions = db.query(models.Transaction).all()
    updated = 0
    for txn in transactions:
        account = txn.account
        account_type_value = account.type if account else None
        new_category = categorize_transaction(
            txn.description_raw or "",
            amount=float(txn.amount) if txn.amount is not None else None,
            date_value=txn.date,
            account_type=account_type_value,
        )
        if txn.category != new_category:
            txn.category = new_category
            updated += 1
    db.commit()
    return {"updated": updated, "total": len(transactions)}


@router.patch(
    "/{transaction_id}/category",
    response_model=schemas.TransactionCategoryUpdateResponse,
    status_code=200,
)
def update_transaction_category(
    transaction_id: int,
    payload: schemas.TransactionCategoryUpdate,
    db: Session = Depends(get_db),
):
    """
    Update a transaction's category. Optionally trigger retraining using all categorized transactions.
    """
    txn = (
        db.query(models.Transaction)
        .filter(models.Transaction.id == transaction_id)
        .first()
    )
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    txn.category = payload.category
    db.commit()
    db.refresh(txn)

    training_report = None
    if payload.retrain:
        categorized = (
            db.query(models.Transaction)
            .join(models.Account)
            .filter(models.Transaction.category.isnot(None))
            .all()
        )
        training_report = train_from_transactions(categorized)
        if not training_report.trained:
            raise HTTPException(status_code=400, detail="Retraining did not run. Provide categorized data.")

    return schemas.TransactionCategoryUpdateResponse(
        transaction=txn,
        training=schemas.CategorizationTrainResponse(
            trained=training_report.trained,
            samples=training_report.samples,
            labels=training_report.labels,
            accuracy=training_report.accuracy,
            macro_f1=training_report.macro_f1,
            heldout_samples=training_report.heldout_samples,
            saved_to=training_report.saved_to,
        )
        if training_report
        else None,
    )


def _should_include_transaction(txn: models.Transaction, account_type_value: str, kind: str):
    account_type = parse_account_type(account_type_value)
    amount = float(txn.amount or 0)
    category_label = (txn.category or "").strip().lower()

    if kind == "investment":
        return category_label == "investment"

    if category_label == "investment":
        return False
    if category_label == "credit payment" and account_type in CREDIT_ACCOUNT_TYPES:
        return False

    if account_type in CREDIT_ACCOUNT_TYPES:
        if amount > 0:
            effective_amount = -abs(amount)
        else:
            effective_amount = 0.0
    elif account_type in INVESTMENT_ACCOUNT_TYPES:
        return False
    else:
        effective_amount = amount

    if kind == "income":
        return effective_amount > 0
    if kind == "expense":
        return effective_amount < 0
    return False


@router.get("/breakdown", response_model=list[schemas.TransactionRead])
def get_transaction_breakdown(
    kind: str = Query(..., pattern="^(income|expense|investment)$"),
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.Transaction, models.Account.type)
        .join(models.Account)
        .filter(
            extract("year", models.Transaction.date) == year,
            extract("month", models.Transaction.date) == month,
        )
        .all()
    )

    filtered = [
        txn for txn, account_type_value in rows if _should_include_transaction(txn, account_type_value, kind)
    ]
    return filtered
