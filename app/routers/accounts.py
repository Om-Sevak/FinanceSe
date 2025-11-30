from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..account_types import parse_account_type

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.post("", response_model=schemas.AccountRead, status_code=201)
def create_account(account: schemas.AccountCreate, db: Session = Depends(get_db)):
    payload = account.model_dump()
    payload["type"] = account.type.value
    db_account = models.Account(**payload)
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account


@router.get("", response_model=list[schemas.AccountRead])
def list_accounts(db: Session = Depends(get_db)):
    accounts = db.query(models.Account).all()
    for account in accounts:
        account.type = parse_account_type(account.type).value
    return accounts


@router.get("/{account_id}", response_model=schemas.AccountRead)
def get_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    account.type = parse_account_type(account.type).value
    return account


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    db.delete(account)
    db.commit()
    return None


@router.delete("/dev/purge", status_code=204)
def purge_accounts(db: Session = Depends(get_db)):
    """
    DEVELOPMENT ONLY: delete all accounts and cascading transactions.
    """
    db.query(models.Account).delete()
    db.commit()
    return None
