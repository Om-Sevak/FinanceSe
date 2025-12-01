from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Optional

from .text_utils import normalize_description

OVERRIDES_PATH = Path(__file__).resolve().parent / "artifacts" / "category_overrides.json"
_LOCK = threading.Lock()


def _ensure_path() -> None:
    OVERRIDES_PATH.parent.mkdir(parents=True, exist_ok=True)


def _load() -> dict[str, str]:
    _ensure_path()
    if OVERRIDES_PATH.exists():
        try:
            return json.loads(OVERRIDES_PATH.read_text())
        except json.JSONDecodeError:
            return {}
    return {}


def _save(data: dict[str, str]) -> None:
    _ensure_path()
    OVERRIDES_PATH.write_text(json.dumps(data, indent=2, sort_keys=True))


def lookup_override(description: str) -> Optional[str]:
    normalized = normalize_description(description)
    if not normalized:
        return None
    with _LOCK:
        overrides = _load()
        return overrides.get(normalized)


def record_override(description: str | None, category: str | None) -> None:
    normalized = normalize_description(description or "")
    if not normalized:
        return
    with _LOCK:
        overrides = _load()
        if category:
            overrides[normalized] = category
        else:
            overrides.pop(normalized, None)
        _save(overrides)
