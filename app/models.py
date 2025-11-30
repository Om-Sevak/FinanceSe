from datetime import datetime
from sqlalchemy import Column, Integer, String, Date, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    institution = Column(String, nullable=False)
    currency = Column(String, nullable=False)
    latest_balance = Column(Numeric(14, 2), nullable=True)

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
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    account = relationship("Account", back_populates="transactions")
