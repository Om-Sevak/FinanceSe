from __future__ import annotations

"""
Shared helpers for dealing with transaction category labels.
"""

ACCOUNT_TRANSFER_CATEGORY = "Account Transfer"
_TRANSFER_CATEGORY_ALIASES = {
    ACCOUNT_TRANSFER_CATEGORY.lower(),
    "credit payment",
}

INVESTMENT_CATEGORY = "Investment"
_INVESTMENT_NORMALIZED = INVESTMENT_CATEGORY.lower()
_INVESTMENT_CATEGORY_ALIASES = {
    _INVESTMENT_NORMALIZED,
    "investments",
    "investment contribution",
    "investment transfer",
    "rrsp",
    "tfsa",
    "rsp",
    "fhsa",
    "retirement contribution",
}


def _normalize(category: str | None) -> str:
    return (category or "").strip().lower()


def canonicalize_category(category: str | None) -> str | None:
    """
    Normalize category labels so we consistently store canonical names.
    """
    if category is None:
        return None
    trimmed = category.strip()
    if not trimmed:
        return None
    normalized = trimmed.lower()
    if normalized in _TRANSFER_CATEGORY_ALIASES:
        return ACCOUNT_TRANSFER_CATEGORY
    if normalized in _INVESTMENT_CATEGORY_ALIASES or normalized.startswith(_INVESTMENT_NORMALIZED):
        return INVESTMENT_CATEGORY
    return trimmed


def is_transfer_category(category: str | None) -> bool:
    return _normalize(category) in _TRANSFER_CATEGORY_ALIASES


def is_investment_category(category: str | None) -> bool:
    normalized = _normalize(category)
    if not normalized:
        return False
    return normalized in _INVESTMENT_CATEGORY_ALIASES or normalized.startswith(_INVESTMENT_NORMALIZED)
