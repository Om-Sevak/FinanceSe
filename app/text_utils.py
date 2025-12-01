from __future__ import annotations

import re

STOPWORDS = {
    "pos",
    "visa",
    "debit",
    "credit",
    "purchase",
    "auth",
    "card",
    "transaction",
    "withdrawal",
    "deposit",
    "online",
    "transfer",
}

NOISE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\d{2,}"),  # strip long digit runs (timestamps, ids)
    re.compile(r"\s+"),
)


def normalize_description(text: str) -> str:
    lowered = (text or "").lower()
    lowered = lowered.replace(";", " ").replace(",", " ")
    for pattern in NOISE_PATTERNS:
        lowered = pattern.sub(" ", lowered)
    tokens = [tok for tok in lowered.split(" ") if tok and tok not in STOPWORDS]
    return " ".join(tokens).strip()
