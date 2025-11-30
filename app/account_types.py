from enum import Enum


class AccountType(str, Enum):
    CHEQUING = "chequing"
    SAVINGS = "savings"
    CASH = "cash"
    CREDIT = "credit"
    LINE_OF_CREDIT = "line_of_credit"
    TFSA = "tfsa"
    RRSP = "rrsp"
    RSP = "rsp"
    RESP = "resp"
    BROKERAGE = "brokerage"
    INVESTMENT = "investment"
    LOAN = "loan"
    FHSA = "fhsa"


CASH_ACCOUNT_TYPES = {
    AccountType.CHEQUING,
    AccountType.SAVINGS,
    AccountType.CASH,
}

INVESTMENT_ACCOUNT_TYPES = {
    AccountType.TFSA,
    AccountType.RRSP,
    AccountType.RSP,
    AccountType.RESP,
    AccountType.BROKERAGE,
    AccountType.INVESTMENT,
    AccountType.FHSA,
}

CREDIT_ACCOUNT_TYPES = {
    AccountType.CREDIT,
    AccountType.LINE_OF_CREDIT,
    AccountType.LOAN,
}

ALL_ACCOUNT_TYPES = [atype.value for atype in AccountType]


def parse_account_type(value: str | None) -> AccountType:
    normalized = (value or "").lower()
    for member in AccountType:
        if member.value == normalized:
            return member
    return AccountType.CHEQUING
