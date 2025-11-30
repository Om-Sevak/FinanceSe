from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Iterable, Sequence

import joblib
import numpy as np
from scipy.sparse import hstack
from sklearn.dummy import DummyClassifier
from sklearn.feature_extraction import DictVectorizer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split

# Lightweight fallback rules used when the model is missing or unconfident.
CATEGORIZATION_RULES = {
    "Groceries": ["supermarket", "grocery", "wal-mart", "costco"],
    "Restaurants": ["restaurant", "cafe", "food", "mcdo", "coffee"],
    "Transportation": ["uber", "taxi", "gas", "parking", "lyft"],
    "Shopping": ["amzn", "store", "shop", "outlet", "mall"],
    "Health": ["pharmacy", "doctor", "hospital", "clinic"],
    "Entertainment": ["cinema", "movies", "concert", "spotify", "netflix"],
    "Utilities": ["electricity", "water", "internet", "phone", "hydro"],
    "Rent": ["rent"],
    "Income": ["salary", "payroll", "standard aero", "paycheque"],
    "Investment": ["brokerage", "investments", "investment", "inv", "ppp", "tfsa", "rrsp"],
    "Credit Payment": ["payment", "thank", "you", "received"],
}

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

AUTO_APPLY_THRESHOLD = 0.58
MODEL_DIR = Path(__file__).resolve().parent / "artifacts"
MODEL_PATH = MODEL_DIR / "categorizer.joblib"


@dataclass
class TrainingExample:
    description: str
    amount: float | None
    date_value: date | None
    account_type: str | None
    category: str


@dataclass
class PredictionResult:
    category: str | None
    confidence: float | None
    source: str  # "model" | "rules" | "none"
    top_categories: list[tuple[str, float]]
    normalized_description: str


@dataclass
class TrainReport:
    trained: bool
    samples: int
    labels: list[str]
    accuracy: float | None
    macro_f1: float | None
    heldout_samples: int
    saved_to: str | None


@dataclass
class _ModelBundle:
    text_vectorizer: TfidfVectorizer
    meta_vectorizer: DictVectorizer
    classifier: LogisticRegression
    labels: list[str]
    trained_at: datetime


class SmartCategorizer:
    """
    Local, efficient text + metadata classifier for transaction categories.
    Uses char + word n-grams and a linear classifier; persists to disk.
    """

    def __init__(self, model_path: Path = MODEL_PATH):
        self.model_path = model_path
        self._bundle: _ModelBundle | None = None
        self._ensure_model_dir()
        self._try_load()

    @staticmethod
    def _ensure_model_dir() -> None:
        MODEL_DIR.mkdir(parents=True, exist_ok=True)

    def _try_load(self) -> None:
        if self.model_path.exists():
            self._bundle = joblib.load(self.model_path)

    @staticmethod
    def _normalize_text(text: str) -> str:
        lowered = (text or "").lower()
        lowered = lowered.replace(";", " ").replace(",", " ")
        for pattern in NOISE_PATTERNS:
            lowered = pattern.sub(" ", lowered)
        tokens = [tok for tok in lowered.split(" ") if tok and tok not in STOPWORDS]
        return " ".join(tokens).strip()

    @staticmethod
    def _meta_features(amount: float | None, date_value: date | None, account_type: str | None) -> dict[str, str]:
        meta: dict[str, str] = {}
        if amount is not None and not math.isinf(amount) and not math.isnan(amount):
            meta["amount_sign"] = "credit" if amount > 0 else "debit"
            bucket = int(round(math.log10(abs(amount) + 1) * 3))
            meta["amount_bucket"] = str(bucket)
        if date_value:
            meta["month"] = str(date_value.month)
            meta["dow"] = str(date_value.weekday())
        if account_type:
            meta["account_type"] = account_type.lower()
        return meta

    @staticmethod
    def _vectorizers() -> tuple[TfidfVectorizer, DictVectorizer]:
        text_vectorizer = TfidfVectorizer(
            analyzer="char",
            ngram_range=(3, 5),
            min_df=2,
            max_features=120_000,
            strip_accents="ascii",
        )
        meta_vectorizer = DictVectorizer(sparse=True)
        return text_vectorizer, meta_vectorizer

    def _transform(self, texts: Sequence[str], metas: Sequence[dict[str, str]]):
        if not self._bundle:
            raise RuntimeError("Model not loaded.")
        text_matrix = self._bundle.text_vectorizer.transform(texts)
        meta_matrix = self._bundle.meta_vectorizer.transform(metas)
        return hstack([text_matrix, meta_matrix])

    def predict(
        self,
        description: str,
        *,
        amount: float | None = None,
        date_value: date | None = None,
        account_type: str | None = None,
        threshold: float = AUTO_APPLY_THRESHOLD,
    ) -> PredictionResult:
        normalized = self._normalize_text(description)
        if not self._bundle:
            return PredictionResult(
                category=None,
                confidence=None,
                source="none",
                top_categories=[],
                normalized_description=normalized,
            )

        features = self._meta_features(amount, date_value, account_type)
        matrix = self._transform([normalized], [features])
        probs = self._bundle.classifier.predict_proba(matrix)[0]
        labels = self._bundle.labels
        if len(probs) != len(labels):
            return PredictionResult(None, None, "none", [], normalized)

        top_indices = np.argsort(probs)[::-1]
        top = [(labels[i], float(probs[i])) for i in top_indices[:5]]
        best_label, best_conf = top[0]
        source = "model" if best_conf >= threshold else "model_unconfident"
        return PredictionResult(
            category=best_label if best_conf >= threshold else None,
            confidence=float(best_conf),
            source=source,
            top_categories=top,
            normalized_description=normalized,
        )

    def train(self, samples: Sequence[TrainingExample]) -> TrainReport:
        if not samples:
            return TrainReport(False, 0, [], None, None, 0, None)

        texts = [self._normalize_text(s.description) for s in samples]
        metas = [self._meta_features(s.amount, s.date_value, s.account_type) for s in samples]
        labels = [s.category for s in samples]

        text_vectorizer, meta_vectorizer = self._vectorizers()
        text_matrix = text_vectorizer.fit_transform(texts)
        meta_matrix = meta_vectorizer.fit_transform(metas)
        X_full = hstack([text_matrix, meta_matrix])
        y_full = np.array(labels)

        accuracy = None
        macro_f1 = None
        heldout = 0

        unique_labels = set(labels)
        label_counts: dict[str, int] = {}
        for label in labels:
            label_counts[label] = label_counts.get(label, 0) + 1
        min_class_size = min(label_counts.values())
        num_classes = len(unique_labels)
        num_samples = len(samples)
        desired_test_size = max(1, int(round(num_samples * 0.2)))
        if len(unique_labels) == 1:
            clf = DummyClassifier(strategy="most_frequent")
            clf.fit(X_full, y_full)
        elif (
            num_samples >= max(30, num_classes * 5)
            and min_class_size >= 2
            and desired_test_size >= num_classes
        ):
            X_train, X_test, y_train, y_test = train_test_split(
                X_full, y_full, test_size=0.2, stratify=y_full, random_state=42
            )
            clf = LogisticRegression(max_iter=1200, n_jobs=-1, class_weight="balanced")
            clf.fit(X_train, y_train)
            y_pred = clf.predict(X_test)
            accuracy = float(accuracy_score(y_test, y_pred))
            macro_f1 = float(f1_score(y_test, y_pred, average="macro"))
            heldout = len(y_test)
            clf.fit(X_full, y_full)
        else:
            clf = LogisticRegression(max_iter=1200, n_jobs=-1, class_weight="balanced")
            clf.fit(X_full, y_full)

        bundle = _ModelBundle(
            text_vectorizer=text_vectorizer,
            meta_vectorizer=meta_vectorizer,
            classifier=clf,
            labels=list(clf.classes_),
            trained_at=datetime.utcnow(),
        )
        joblib.dump(bundle, self.model_path)
        self._bundle = bundle

        return TrainReport(
            trained=True,
            samples=len(samples),
            labels=bundle.labels,
            accuracy=accuracy,
            macro_f1=macro_f1,
            heldout_samples=heldout,
            saved_to=str(self.model_path),
        )

    def status(self) -> dict[str, str | int | list[str] | None]:
        if not self._bundle:
            return {"trained": False, "trained_at": None, "labels": []}
        return {
            "trained": True,
            "trained_at": self._bundle.trained_at.isoformat(),
            "labels": self._bundle.labels,
            "model_path": str(self.model_path),
        }


_SMART_CATEGORIZER = SmartCategorizer()


def _fallback_rule(description: str) -> str | None:
    lowered = (description or "").lower()
    for category, keywords in CATEGORIZATION_RULES.items():
        if any(keyword in lowered for keyword in keywords):
            return category
    return None


def categorize_transaction(
    description: str,
    amount: float | None = None,
    date_value: date | None = None,
    account_type: str | None = None,
) -> str | None:
    """
    Predict the category for a transaction.
    Tries the ML model first; falls back to heuristic rules when unconfident.
    """
    prediction = _SMART_CATEGORIZER.predict(
        description, amount=amount, date_value=date_value, account_type=account_type
    )
    if prediction.category:
        return prediction.category
    return _fallback_rule(description)


def categorize_with_details(
    description: str,
    *,
    amount: float | None = None,
    date_value: date | None = None,
    account_type: str | None = None,
) -> PredictionResult:
    """
    Get prediction details including confidence and top categories.
    """
    prediction = _SMART_CATEGORIZER.predict(
        description, amount=amount, date_value=date_value, account_type=account_type
    )
    if prediction.category is None:
        fallback = _fallback_rule(description)
        if fallback:
            return PredictionResult(
                category=fallback,
                confidence=None,
                source="rules",
                top_categories=[],
                normalized_description=prediction.normalized_description,
            )
    return prediction


def train_from_transactions(transactions: Iterable) -> TrainReport:
    """
    Train the model using transactions that already have categories.
    Expects each item to have: description_raw, amount, date, account (with type), category.
    """
    samples: list[TrainingExample] = []
    for txn in transactions:
        if not txn.category:
            continue
        samples.append(
            TrainingExample(
                description=txn.description_raw or "",
                amount=float(txn.amount) if txn.amount is not None else None,
                date_value=txn.date,
                account_type=getattr(getattr(txn, "account", None), "type", None),
                category=txn.category,
            )
        )
    return _SMART_CATEGORIZER.train(samples)


def get_categorizer_status() -> dict[str, str | int | list[str] | None]:
    """
    Return current model status/metadata.
    """
    return _SMART_CATEGORIZER.status()
