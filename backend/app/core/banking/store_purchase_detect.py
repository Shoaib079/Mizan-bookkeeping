"""Detect retail store purchases in bank descriptions (P8 — no-invoice card spend)."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.core.expenses.normalize import normalize_expense_item_text

# Common Turkish grocery / convenience chains — retail card spend, not supplier AP.
_STORE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("Migros", re.compile(r"\bMIGROS\b", re.IGNORECASE)),
    ("BİM", re.compile(r"\bBIM\b|\bBİM\b", re.IGNORECASE)),
    ("A101", re.compile(r"\bA101\b", re.IGNORECASE)),
    ("Şok", re.compile(r"\bSOK\b|\bŞOK\b", re.IGNORECASE)),
    ("Carrefour", re.compile(r"\bCARREFOUR\b|\bCARREFOURSA\b", re.IGNORECASE)),
    ("File", re.compile(r"\bFILE\b|\bFILE MARKET\b", re.IGNORECASE)),
    ("Happy Center", re.compile(r"\bHAPPY\s*CENTER\b", re.IGNORECASE)),
)


@dataclass(frozen=True, slots=True)
class StorePurchaseMatch:
    store_name: str
    match_token: str


def is_store_purchase_description(description: str) -> StorePurchaseMatch | None:
    """Return the matched retail store when description looks like a grocery purchase."""
    if not description.strip():
        return None

    normalized = normalize_expense_item_text(description).replace("ı", "i")
    upper = description.upper()

    for store_name, pattern in _STORE_PATTERNS:
        if pattern.search(upper) or pattern.search(normalized):
            token = normalize_expense_item_text(store_name).replace("ı", "i").upper()
            return StorePurchaseMatch(store_name=store_name, match_token=token)

    return None
