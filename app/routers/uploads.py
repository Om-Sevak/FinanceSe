from collections.abc import Iterable
from decimal import Decimal
from io import StringIO
from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..categorization import categorize_with_details
from ..account_types import AccountType, parse_account_type
from ..services.pdf_ingestion import PDFTransactionExtractor, TransactionRow
from ..category_labels import canonicalize_category
from ..transaction_logic import normalize_transaction_amount
from .auth import get_current_user

router = APIRouter(prefix="/uploads", tags=["uploads"])
_pdf_extractor = PDFTransactionExtractor()

def _normalize_header(name: str) -> str:
    return (
        (name or "")
        .strip()
        .lower()
        .replace(" ", "")
        .replace("_", "")
    )

PAYMENT_KEYWORDS = {}

def _build_transactions(account: models.Account, rows: Iterable[Any]):
    account_type = parse_account_type(account.type)
    transactions: list[models.Transaction] = []
    last_balance: Decimal | None = None
    for row in rows:
        if isinstance(row, TransactionRow):
            description = row.description.strip()
            date_value = row.date
            amount_value = row.amount
            balance_value = row.balance
        else:
            description = (row.get("description") or "").strip()
            date_value = row.get("date")
            amount_value = row.get("amount")
            balance_value = row.get("balance")

        if not description or date_value is None or amount_value is None:
            continue

        parsed_date = pd.to_datetime(date_value, errors="coerce")
        if pd.isna(parsed_date):
            continue

        amount_value = Decimal(amount_value)
        prediction = categorize_with_details(
            description,
            amount=amount_value,
            date_value=parsed_date.date(),
            account_type=account_type.value,
        )
        category = canonicalize_category(prediction.category)
        amount_value = normalize_transaction_amount(amount_value, account_type.value, category)
        
        txn_data = schemas.TransactionCreate(
            account_id=account.id,
            date=parsed_date.date(),
            description_raw=description,
            description_clean=prediction.normalized_description,
            amount=amount_value,
            currency=account.currency,
            category=category,
        )
        transactions.append(models.Transaction(**txn_data.model_dump()))

        if balance_value is not None and not pd.isna(balance_value):
            try:
                last_balance = Decimal(balance_value)
            except (TypeError, ValueError):
                continue
    return transactions, last_balance


def _parse_csv_bytes(contents: bytes) -> list[dict[str, Any]]:
    buffer = StringIO(contents.decode("utf-8-sig"))

    def try_standard_format() -> pd.DataFrame | None:
        buffer.seek(0)
        try:
            df = pd.read_csv(buffer)
        except Exception:
            return None

        header_map = {_normalize_header(col): col for col in df.columns}
        required_keys = {"date", "description", "amount"}
        if not required_keys.issubset(header_map.keys()):
            return None

        date_col = header_map["date"]
        desc_col = header_map["description"]
        amount_col = header_map["amount"]

        data = {
            "date": pd.to_datetime(df[date_col], errors="coerce").dt.date,
            "description": df[desc_col].astype(str),
            "amount": pd.to_numeric(df[amount_col], errors="coerce"),
        }
        if "balance" in header_map:
            balance_col = header_map["balance"]
            data["balance"] = pd.to_numeric(df[balance_col], errors="coerce")

        normalized = pd.DataFrame(data)
        normalized = normalized.dropna(subset=["date", "description", "amount"])
        return normalized

    def try_statement_format() -> pd.DataFrame | None:
        buffer.seek(0)
        try:
            df = pd.read_csv(buffer, header=None)
        except Exception:
            return None

        if df.shape[1] < 4:
            return None

        date_series = pd.to_datetime(df.iloc[:, 0], errors="coerce").dt.date
        description_series = df.iloc[:, 1].astype(str).str.strip()

        balance_series = None
        if df.shape[1] >= 5:
            withdrawals = pd.to_numeric(df.iloc[:, 2], errors="coerce").fillna(0)
            deposits = pd.to_numeric(df.iloc[:, 3], errors="coerce").fillna(0)
            amount_series = deposits - withdrawals
            balance_series = pd.to_numeric(df.iloc[:, 4], errors="coerce")
        else:
            amount_series = pd.to_numeric(df.iloc[:, 2], errors="coerce")

        data = {
            "date": date_series,
            "description": description_series,
            "amount": amount_series,
        }
        if balance_series is not None:
            data["balance"] = balance_series

        normalized = pd.DataFrame(data).dropna(subset=["date", "description"])

        normalized["amount"] = pd.to_numeric(normalized["amount"], errors="coerce")
        normalized = normalized.dropna(subset=["amount"])
        return normalized

    parsed_df = try_standard_format()
    if parsed_df is None:
        parsed_df = try_statement_format()

    if parsed_df is None or parsed_df.empty:
        raise ValueError(
            "CSV format not recognized. Provide headers (Date, Description, Amount) "
            "or a headerless export with columns Date, Description, Amount, Balance."
        )

    return parsed_df.to_dict("records")


@router.post("/{account_id}/csv", response_model=list[schemas.TransactionRead])
async def upload_csv(
    account_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Upload a CSV file with transactions for a specific account.
    The CSV is parsed and transactions are saved to the database.
    The CSV must contain 'Date', 'Description', and 'Amount' columns.
    """
    account = (
        db.query(models.Account)
        .filter(models.Account.id == account_id, models.Account.user_id == current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unable to read file: {e}")

    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        rows = _parse_csv_bytes(contents)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )
    transactions, last_balance = _build_transactions(account, rows)
    if not transactions:
        raise HTTPException(status_code=400, detail="No valid transactions found in CSV.")

    db.add_all(transactions)
    if last_balance is not None:
        account.latest_balance = last_balance
    db.commit()
    for txn in transactions:
        db.refresh(txn)

    return transactions


@router.post("/{account_id}/pdf", response_model=list[schemas.TransactionRead])
async def upload_pdf(
    account_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Upload a PDF statement with columns: Date, Description, Amount, Balance.
    The PDF is parsed into transactions and saved to the database.
    """
    account = (
        db.query(models.Account)
        .filter(models.Account.id == account_id, models.Account.user_id == current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unable to read file: {e}")

    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        rows = _pdf_extractor.extract(contents)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    transactions, last_balance = _build_transactions(account, rows)
    if not transactions:
        raise HTTPException(
            status_code=400,
            detail="PDF parsed successfully but contained no new transactions.",
        )

    db.add_all(transactions)
    if last_balance is not None:
        account.latest_balance = last_balance
    db.commit()
    for txn in transactions:
        db.refresh(txn)

    return transactions
