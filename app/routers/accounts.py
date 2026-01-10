from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..account_types import parse_account_type
from .auth import get_current_user

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.post("", response_model=schemas.AccountRead, status_code=201)
def create_account(
    account: schemas.AccountCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    payload = account.model_dump()
    payload["type"] = account.type.value
    payload["user_id"] = current_user.id
    db_account = models.Account(**payload)
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account


@router.get("", response_model=list[schemas.AccountRead])
def list_accounts(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    accounts = db.query(models.Account).filter(models.Account.user_id == current_user.id).all()
    for account in accounts:
        account.type = parse_account_type(account.type).value
    return accounts


@router.get("/{account_id}", response_model=schemas.AccountRead)
def get_account(
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
    account.type = parse_account_type(account.type).value
    return account


@router.delete("/{account_id}", status_code=204)
def delete_account(
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
    db.delete(account)
    db.commit()
    return None


@router.delete("/dev/purge", status_code=204)
def purge_accounts(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    DEVELOPMENT ONLY: delete all accounts and cascading transactions for the current user.
    """
    db.query(models.Account).filter(models.Account.user_id == current_user.id).delete()
    db.commit()
    return None
