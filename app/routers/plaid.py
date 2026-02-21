from decimal import Decimal

import plaid
from fastapi import APIRouter, Depends, HTTPException
from plaid.api import plaid_api as plaid_api_module
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.transactions_sync_request import TransactionsSyncRequest
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import PLAID_CLIENT_ID, PLAID_ENCRYPTION_KEY, PLAID_SECRET
from ..database import get_db
from ..plaid_client import get_plaid_api
from .auth import get_current_user
from .uploads import _build_transactions

router = APIRouter(prefix="/plaid", tags=["plaid"])


def _get_fernet():
    if not PLAID_ENCRYPTION_KEY:
        raise HTTPException(status_code=503, detail="Plaid encryption key not configured")
    from cryptography.fernet import Fernet
    return Fernet(PLAID_ENCRYPTION_KEY.encode())


def _encrypt(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def _decrypt(value: str) -> str:
    return _get_fernet().decrypt(value.encode()).decode()


def _map_account_type(plaid_type: str, plaid_subtype: str | None) -> str:
    t = (plaid_type or "").lower()
    s = (plaid_subtype or "").lower()
    if t == "depository":
        return "chequing" if s in ("checking", "chequing") else "savings"
    if t == "credit":
        return "credit"
    if t == "loan":
        return "loan"
    if t == "investment":
        return "brokerage"
    return "chequing"


@router.post("/link-token", response_model=schemas.LinkTokenResponse)
async def create_link_token(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not PLAID_CLIENT_ID or not PLAID_SECRET:
        raise HTTPException(status_code=503, detail="Plaid is not configured on this server.")
    plaid_client = get_plaid_api()
    try:
        request = LinkTokenCreateRequest(
            products=[Products("transactions")],
            client_name="FinanceSe",
            country_codes=[CountryCode("CA"), CountryCode("US")],
            language="en",
            user=LinkTokenCreateRequestUser(client_user_id=str(current_user.id)),
        )
        response = plaid_client.link_token_create(request)
        return {"link_token": response.link_token}
    except plaid.ApiException as e:
        raise HTTPException(status_code=400, detail=f"Plaid error: {e.body}")


@router.post("/exchange-token", response_model=list[schemas.AccountRead])
async def exchange_token(
    payload: schemas.ExchangeTokenRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    plaid_client = get_plaid_api()
    try:
        exchange_resp = plaid_client.item_public_token_exchange(
            ItemPublicTokenExchangeRequest(public_token=payload.public_token)
        )
        access_token: str = exchange_resp.access_token
        item_id: str = exchange_resp.item_id
    except plaid.ApiException as e:
        raise HTTPException(status_code=400, detail=f"Plaid error: {e.body}")

    plaid_item = models.PlaidItem(
        user_id=current_user.id,
        item_id=item_id,
        access_token=_encrypt(access_token),
        institution_name=payload.institution_name,
    )
    db.add(plaid_item)
    db.flush()

    try:
        accounts_resp = plaid_client.accounts_get(AccountsGetRequest(access_token=access_token))
    except plaid.ApiException as e:
        raise HTTPException(status_code=400, detail=f"Plaid accounts error: {e.body}")

    created_accounts: list[models.Account] = []
    for plaid_acct in accounts_resp.accounts:
        acct_type = _map_account_type(
            str(plaid_acct.type),
            str(plaid_acct.subtype) if plaid_acct.subtype is not None else None,
        )
        balance = None
        if plaid_acct.balances and plaid_acct.balances.current is not None:
            balance = Decimal(str(plaid_acct.balances.current))
        currency = (
            plaid_acct.balances.iso_currency_code
            if plaid_acct.balances and plaid_acct.balances.iso_currency_code
            else "CAD"
        )
        account = models.Account(
            user_id=current_user.id,
            name=plaid_acct.name or plaid_acct.official_name or "Account",
            type=acct_type,
            institution=payload.institution_name,
            currency=currency,
            latest_balance=balance,
            plaid_item_id=plaid_item.id,
            plaid_account_id=plaid_acct.account_id,
        )
        db.add(account)
        created_accounts.append(account)

    db.commit()
    for acc in created_accounts:
        db.refresh(acc)
    return created_accounts


@router.post("/sync/{account_id}", response_model=schemas.PlaidSyncResponse)
async def sync_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    account = (
        db.query(models.Account)
        .filter(models.Account.id == account_id, models.Account.user_id == current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if not account.plaid_account_id or not account.plaid_item_id:
        raise HTTPException(status_code=400, detail="Account is not linked to Plaid")

    plaid_item = db.query(models.PlaidItem).filter(models.PlaidItem.id == account.plaid_item_id).first()
    if not plaid_item:
        raise HTTPException(status_code=404, detail="Plaid item not found")

    access_token = _decrypt(plaid_item.access_token)
    plaid_client = get_plaid_api()

    all_added = []
    all_modified = []
    all_removed = []
    cursor = plaid_item.cursor or ""

    try:
        has_more = True
        while has_more:
            req_kwargs: dict = {"access_token": access_token}
            if cursor:
                req_kwargs["cursor"] = cursor
            response = plaid_client.transactions_sync(TransactionsSyncRequest(**req_kwargs))
            all_added.extend(response.added)
            all_modified.extend(response.modified)
            all_removed.extend(response.removed)
            has_more = response.has_more
            cursor = response.next_cursor
    except plaid.ApiException as e:
        raise HTTPException(status_code=400, detail=f"Plaid sync error: {e.body}")

    plaid_account_id = account.plaid_account_id
    account_added = [t for t in all_added if t.account_id == plaid_account_id]
    account_modified = [t for t in all_modified if t.account_id == plaid_account_id]
    account_removed_ids = [t.transaction_id for t in all_removed if t.account_id == plaid_account_id]

    # Fetch existing Plaid transaction IDs to deduplicate
    existing_ids: set[str] = set(
        row[0]
        for row in db.query(models.Transaction.plaid_transaction_id)
        .filter(
            models.Transaction.account_id == account_id,
            models.Transaction.plaid_transaction_id.isnot(None),
        )
        .all()
    )

    # Build one transaction at a time so we can attach plaid_transaction_id
    new_transactions: list[models.Transaction] = []
    for plaid_txn in account_added:
        tid = plaid_txn.transaction_id
        if tid in existing_ids:
            continue
        # Plaid sign convention: positive = debit/outflow; negate to match our sign convention
        amount = -float(plaid_txn.amount)
        row = {
            "date": str(plaid_txn.date),
            "description": plaid_txn.name or "Transaction",
            "amount": amount,
        }
        built, _ = _build_transactions(account, [row])
        if built:
            built[0].plaid_transaction_id = tid
            new_transactions.append(built[0])
        existing_ids.add(tid)

    db.add_all(new_transactions)

    if account_removed_ids:
        db.query(models.Transaction).filter(
            models.Transaction.plaid_transaction_id.in_(account_removed_ids)
        ).delete(synchronize_session=False)

    plaid_item.cursor = cursor
    db.commit()

    return {
        "added": len(new_transactions),
        "modified": len(account_modified),
        "removed": len(account_removed_ids),
    }


@router.get("/items", response_model=list[schemas.PlaidItemRead])
async def list_plaid_items(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.PlaidItem).filter(models.PlaidItem.user_id == current_user.id).all()
