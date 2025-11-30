from __future__ import annotations

from dataclasses import dataclass
from datetime import date as date_cls
from io import BytesIO
import re
from typing import Any, Iterable, Iterator, List, Sequence

import pandas as pd
import pdfplumber

MONTH_MAP = {
    "JAN": 1,
    "FEB": 2,
    "MAR": 3,
    "APR": 4,
    "MAY": 5,
    "JUN": 6,
    "JUL": 7,
    "AUG": 8,
    "SEP": 9,
    "SEPT": 9,
    "OCT": 10,
    "NOV": 11,
    "DEC": 12,
}


@dataclass
class TransactionRow:
    date: date_cls
    description: str
    amount: float
    balance: float | None = None


def _clean_amount(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1]
    text = text.replace("$", "").replace(",", "").replace(" ", "").replace("\u2212", "-")
    if not text:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    return -number if negative or number < 0 else number


def _split_cell(cell: Any) -> list[str]:
    if cell is None:
        return []
    text = str(cell).replace("\r", "\n")
    parts = [part.strip() for part in text.split("\n")]
    return [part for part in parts if part]


def _infer_year_from_text(text: str) -> int | None:
    if not text:
        return None
    match = re.search(
        r"(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\s*\d{1,2}[-/ ]+(\d{2,4})",
        text,
        re.IGNORECASE,
    )
    if not match:
        return None
    year = int(match.group(1))
    if year < 100:
        year += 2000
    return year


def _parse_pdf_date_token(token: str, fallback_year: int | None) -> date_cls | None:
    token = (token or "").strip()
    if not token:
        return None
    normalized = re.sub(r"[^A-Za-z0-9/ ]", "", token).upper()
    compact = normalized.replace(" ", "")
    explicit_year = bool(re.search(r"/\d{2,4}", normalized) or re.search(r"\d{4}", normalized))
    candidates: list[str] = []

    if compact:
        candidates.append(compact)
    if " " in normalized:
        candidates.append(normalized)
    candidates.append(token)

    if re.match(r"^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\d{1,2}$", compact):
        candidates.append(f"{compact[:3]} {compact[3:]}")

    if "/" in normalized:
        month_day, _, year_part = normalized.partition("/")
        if month_day and year_part:
            year_val = int(year_part)
            if year_val < 100:
                year_val += 2000
            candidates.append(f"{month_day} {year_val}")

    for candidate in candidates:
        parsed = pd.to_datetime(candidate, errors="coerce")
        if not pd.isna(parsed):
            parsed_date = parsed.date()
            if fallback_year and not explicit_year:
                return parsed_date.replace(year=fallback_year)
            return parsed_date

    if fallback_year:
        match = re.match(
            r"^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\s*(\d{1,2})$",
            compact,
        )
        if match:
            month = MONTH_MAP[match.group(1)[:3]]
            day = int(match.group(2))
            return date_cls(fallback_year, month, day)

    return None


class Strategy:
    """
    Base class for PDF extraction strategies.
    Each strategy receives the page object and yields TransactionRow instances.
    """

    def extract(self, page: pdfplumber.page.Page, *, fallback_year: int | None) -> Iterable[TransactionRow]:
        raise NotImplementedError


class TableStrategy(Strategy):
    HEADER_KEYWORDS = {"description", "withdrawal", "deposit", "date", "balance", "transaction"}

    def extract(self, page: pdfplumber.page.Page, *, fallback_year: int | None) -> Iterable[TransactionRow]:
        tables = page.extract_tables() or []
        for table in tables:
            yield from self._extract_from_table(table, fallback_year=fallback_year)

    def _extract_from_table(self, table: Sequence[Sequence[Any]], *, fallback_year: int | None) -> Iterable[TransactionRow]:
        if not table:
            return
        header = [((cell or "").strip().lower()) for cell in table[0]]
        if not any(keyword in header_cell for keyword in self.HEADER_KEYWORDS for header_cell in header):
            return
        desc_idx = self._find_index(header, ["description", "transaction", "details"]) or 0
        withdraw_idx = self._find_index(header, ["withdraw", "debit"])
        deposit_idx = self._find_index(header, ["deposit", "credit"])
        date_idx = self._find_index(header, ["date"])
        balance_idx = self._find_index(header, ["balance"])
        if withdraw_idx is None and len(header) > 1:
            withdraw_idx = 1
        if deposit_idx is None and len(header) > 2:
            deposit_idx = 2
        if date_idx is None and len(header) > 3:
            date_idx = 3
        if balance_idx is None and len(header) > 4:
            balance_idx = 4

        # Instead of transposing complicated structures, iterate per row
        for raw_row in table[1:]:
            split_cols = [_split_cell(cell) for cell in raw_row]
            max_len = max((len(col) for col in split_cols), default=0)
            if max_len == 0:
                continue
            for idx in range(max_len):
                description = self._value_at(split_cols, desc_idx, idx)
                withdrawals = self._value_at(split_cols, withdraw_idx, idx)
                deposits = self._value_at(split_cols, deposit_idx, idx)
                date_token = self._value_at(split_cols, date_idx, idx)

                if not description and not withdrawals and not deposits:
                    continue
                if description.upper().startswith("STARTING") or description.upper().startswith("ENDING"):
                    continue

                parsed_date = _parse_pdf_date_token(date_token, fallback_year)
                debit = _clean_amount(withdrawals)
                credit = _clean_amount(deposits)
                amount = None
                if debit:
                    amount = -abs(debit)
                elif credit:
                    amount = abs(credit)

                if parsed_date is None or amount is None:
                    continue

                balance_value = None
                if balance_idx is not None:
                    balance_text = self._value_at(split_cols, balance_idx, idx)
                    balance_value = _clean_amount(balance_text)

                yield TransactionRow(
                    date=parsed_date,
                    description=description,
                    amount=amount,
                    balance=balance_value,
                )

    @staticmethod
    def _find_index(header: Sequence[str], keywords: list[str]) -> int | None:
        if not keywords:
            return None
        for idx, cell in enumerate(header):
            for keyword in keywords:
                if keyword in cell:
                    return idx
        return None

    @staticmethod
    def _value_at(split_cols: list[list[str]], column_idx: int | None, row_idx: int) -> str:
        if column_idx is None:
            return ""
        if column_idx >= len(split_cols):
            return ""
        column = split_cols[column_idx]
        if row_idx >= len(column):
            return ""
        return column[row_idx]


class RegexTextStrategy(Strategy):
    """
    Fallback strategy that scans plain text lines for date + amount patterns.
    Useful when tables cannot be extracted cleanly.
    """

    LINE_RE = re.compile(
        r"^(?P<date>(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z\s]*\d{1,2})"
        r"\s+(?P<desc>.+?)\s+(?P<amount>[\+\-]?\$?\d[\d,]*(?:\.\d{2})?)$",
        re.IGNORECASE,
    )

    def extract(self, page: pdfplumber.page.Page, *, fallback_year: int | None) -> Iterable[TransactionRow]:
        text = page.extract_text() or ""
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        for line in lines:
            match = self.LINE_RE.match(line)
            if not match:
                continue
            parsed_date = _parse_pdf_date_token(match.group("date"), fallback_year)
            amount = _clean_amount(match.group("amount"))
            if parsed_date is None or amount is None:
                continue
            yield TransactionRow(
                date=parsed_date,
                description=match.group("desc"),
                amount=amount,
            )


class PDFTransactionExtractor:
    """
    Generic PDF transaction extractor composed of multiple strategies.
    Strategies can be extended (e.g., OCR-based, ML-based) without touching callers.
    """

    def __init__(self, strategies: Sequence[Strategy] | None = None):
        self.strategies = list(strategies) if strategies is not None else [
            TableStrategy(),
            RegexTextStrategy(),
        ]

    def extract(self, contents: bytes) -> list[TransactionRow]:
        transactions: list[TransactionRow] = []
        try:
            with pdfplumber.open(BytesIO(contents)) as pdf:
                pages = list(pdf.pages)
                combined_text = "\n".join(
                    filter(None, ((page.extract_text() or "") for page in pages))
                )
                fallback_year = _infer_year_from_text(combined_text)
                for page in pages:
                    for strategy in self.strategies:
                        transactions.extend(strategy.extract(page, fallback_year=fallback_year))
        except Exception as exc:
            raise ValueError(f"Unable to parse PDF: {exc}") from exc

        if not transactions:
            raise ValueError(
                "No recognizable transactions found in PDF. "
                "Consider improving strategies or ensuring the statement contains tabular data."
            )

        return transactions
