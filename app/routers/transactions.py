from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import extract, func

from .. import models, schemas
from ..database import get_db
from ..category_labels import canonicalize_category
from ..category_overrides import record_override
from ..categorization import categorize_transaction, train_from_transactions
from ..transaction_logic import normalize_transaction_amount
from ..services.transaction_metrics import (
    aggregate_transactions,
    build_category_breakdown,
    calculate_net_worth,
    filter_transactions_by_kind,
)
from .auth import get_current_user

router = APIRouter(prefix="/transactions", tags=["transactions"])



@router.post("", response_model=list[schemas.TransactionRead], status_code=201)
def create_transactions(
    transactions: list[schemas.TransactionCreate],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not transactions:
        raise HTTPException(status_code=400, detail="No transactions provided")
    account_ids = {txn.account_id for txn in transactions}
    accounts = (
        db.query(models.Account)
        .filter(models.Account.id.in_(account_ids), models.Account.user_id == current_user.id)
        .all()
    )
    account_map = {account.id: account for account in accounts}
    missing = account_ids - set(account_map.keys())
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown account ids: {sorted(missing)}")
    db_transactions: list[models.Transaction] = []
    for txn in transactions:
        payload = txn.model_dump()
        payload["category"] = canonicalize_category(payload.get("category"))
        account = account_map[payload["account_id"]]
        payload["amount"] = normalize_transaction_amount(
            payload["amount"],
            account.type,
            payload["category"],
        )
        db_transactions.append(models.Transaction(**payload))
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
    current_user: models.User = Depends(get_current_user),
):
    query = (
        db.query(models.Transaction)
        .join(models.Account)
        .filter(models.Account.user_id == current_user.id)
    )
    if account_id is not None:
        query = query.filter(models.Transaction.account_id == account_id)
    if year is not None:
        query = query.filter(extract("year", models.Transaction.date) == year)
    if month is not None:
        query = query.filter(extract("month", models.Transaction.date) == month)
    return query.order_by(models.Transaction.date.desc()).all()


@router.get("/summary", response_model=schemas.TransactionSummary)
def get_transaction_summary(
    year: int | None = Query(default=None),
    month: int | None = Query(default=None, ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Monthly summary rules:
    - income only counts inflows on cash accounts
    - expenses aggregate cash + credit outflows (transfers excluded)
    - account transfers are neutralized
    - investment contributions (category or account-type) tracked separately
    """
    rows = (
        db.query(models.Transaction, models.Account.type)
        .join(models.Account)
        .filter(models.Account.user_id == current_user.id)
        .all()
    )
    if year is not None:
        rows = [(txn, atype) for txn, atype in rows if txn.date.year == year]
    if month is not None:
        rows = [(txn, atype) for txn, atype in rows if txn.date.month == month]

    totals = aggregate_transactions(rows)

    net_flow = totals.income + totals.expenses - totals.invested
    savings_rate = net_flow / totals.income if totals.income > 0 else 0.0

    balance_query = (
        db.query(
            models.Account.id,
            models.Account.type,
            models.Account.latest_balance,
            func.coalesce(func.sum(models.Transaction.amount), 0),
        )
        .outerjoin(models.Transaction)
        .filter(models.Account.user_id == current_user.id)
    )
    if year is not None:
        balance_query = balance_query.filter(extract("year", models.Transaction.date) == year)
    if month is not None:
        balance_query = balance_query.filter(extract("month", models.Transaction.date) == month)

    balances = balance_query.group_by(
        models.Account.id, models.Account.type, models.Account.latest_balance
    ).all()

    net_worth = calculate_net_worth(balances)

    return schemas.TransactionSummary(
        total_income=totals.income,
        total_expenses=totals.expenses,
        total_invested=totals.invested,
        net_flow=net_flow,
        savings_rate=savings_rate,
        net_worth=net_worth,
    )


@router.get(
    "/expenses/by-category", response_model=list[schemas.CategoryExpenseSummary]
)
def get_expenses_by_category(
    year: int | None = Query(default=None),
    month: int | None = Query(default=None, ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Get a summary of expenses by category for a given year and month.
    """
    rows = (
        db.query(models.Transaction, models.Account.type)
        .join(models.Account)
        .filter(models.Account.user_id == current_user.id)
        .all()
    )
    if year is not None:
        rows = [(txn, atype) for txn, atype in rows if txn.date.year == year]
    if month is not None:
        rows = [(txn, atype) for txn, atype in rows if txn.date.month == month]

    return build_category_breakdown(rows)


@router.delete("/dev/purge", status_code=204)
def purge_all_transactions(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    DEVELOPMENT ONLY: delete every recorded transaction.
    """
    accounts = db.query(models.Account).filter(models.Account.user_id == current_user.id).all()
    account_ids = [acct.id for acct in accounts]
    if account_ids:
        db.query(models.Transaction).filter(models.Transaction.account_id.in_(account_ids)).delete()
        db.query(models.Account).filter(models.Account.id.in_(account_ids)).update(
            {models.Account.latest_balance: None}
        )
    db.commit()
    return None


@router.post("/dev/re-categorize", status_code=200)
def recategorize_transactions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    DEVELOPMENT ONLY: re-run categorization rules for all transactions.
    """
    transactions = (
        db.query(models.Transaction)
        .join(models.Account)
        .filter(models.Account.user_id == current_user.id)
        .all()
    )
    updated = 0
    for txn in transactions:
        account = txn.account
        account_type_value = account.type if account else None
        new_category = categorize_transaction(
            txn.description_raw or "",
            amount=txn.amount if txn.amount is not None else None,
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
    current_user: models.User = Depends(get_current_user),
):
    """
    Update a transaction's category and retrain using all categorized transactions.
    """
    txn = (
        db.query(models.Transaction)
        .join(models.Account)
        .filter(models.Transaction.id == transaction_id, models.Account.user_id == current_user.id)
        .first()
    )
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    txn.category = canonicalize_category(payload.category)
    record_override(txn.description_raw or "", txn.category)
    db.commit()
    db.refresh(txn)

    categorized = (
        db.query(models.Transaction)
        .join(models.Account)
        .filter(models.Transaction.category.isnot(None), models.Account.user_id == current_user.id)
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


@router.get("/breakdown", response_model=list[schemas.TransactionRead])
def get_transaction_breakdown(
    kind: str = Query(..., pattern="^(income|expense|investment)$"),
    year: int | None = Query(default=None),
    month: int | None = Query(default=None, ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows = (
        db.query(models.Transaction, models.Account.type)
        .join(models.Account)
        .filter(models.Account.user_id == current_user.id)
        .all()
    )

    if year is not None:
        rows = [(txn, atype) for txn, atype in rows if txn.date.year == year]
    if month is not None:
        rows = [(txn, atype) for txn, atype in rows if txn.date.month == month]

    return filter_transactions_by_kind(rows, kind)
