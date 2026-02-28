from datetime import datetime
from sqlalchemy import Column, Integer, String, Date, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    accounts = relationship("Account", back_populates="user", cascade="all, delete-orphan")
    plaid_items = relationship("PlaidItem", back_populates="user", cascade="all, delete-orphan")


class PlaidItem(Base):
    __tablename__ = "plaid_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    item_id = Column(String, unique=True, nullable=False)
    access_token = Column(String, nullable=False)  # encrypted at rest
    institution_name = Column(String, nullable=False)
    cursor = Column(String, nullable=True)  # transactions/sync cursor
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="plaid_items")


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    institution = Column(String, nullable=False)
    currency = Column(String, nullable=False)
    latest_balance = Column(Numeric(14, 2), nullable=True)
    plaid_item_id = Column(Integer, ForeignKey("plaid_items.id"), nullable=True)
    plaid_account_id = Column(String, nullable=True)

    user = relationship("User", back_populates="accounts")
    transactions = relationship(
        "Transaction",
        back_populates="account",
        cascade="all, delete-orphan",
    )


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    date = Column(Date, nullable=False)
    description_raw = Column(String, nullable=False)
    description_clean = Column(String, nullable=True)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String, nullable=False)
    category = Column(String, nullable=True)
    subcategory = Column(String, nullable=True)
    plaid_transaction_id = Column(String, unique=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    account = relationship("Account", back_populates="transactions")
