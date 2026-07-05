"""Deterministic bank-fee detection for statement import (BSF-1).

Matches Turkish bank charge descriptions (ücret, masraf, BSMV, aidat, bakım, etc.)
without treating bare transfer keywords (havale/eft/komisyon) as fees.
"""

from __future__ import annotations

import re

from app.core.expenses.normalize import normalize_expense_item_text

_TURKISH_FOLD = str.maketrans(
    {
        "ü": "u",
        "ö": "o",
        "ş": "s",
        "ç": "c",
        "ğ": "g",
        "ı": "i",
    }
)


def _normalize_fee_text(description: str) -> str:
    return normalize_expense_item_text(description).translate(_TURKISH_FOLD)

_FEE_WORD = r"(?:ucret(?:i)?|masraf(?:i)?|aidat(?:i)?|komisyon(?:u)?)"
_FEE_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\bbsmv\b",
        rf"\b{_FEE_WORD}\b",
        r"\bhesap\s+isletim\b",
        r"\bisletim\s+ucret",
        r"\bperiyodik\s+bakim\b",
        r"\bbakim\s+ucret",
        rf"\b(?:ekstre|islem)\s+{_FEE_WORD}\b",
        rf"\b{_FEE_WORD}\s+(?:ekstre|islem)\b",
        rf"\b(?:havale|eft|fast)\s+{_FEE_WORD}\b",
        rf"\b{_FEE_WORD}\s+(?:havale|eft|fast)\b",
        r"\bkart\s+aidat\b",
    )
)

_BARE_FEE_TOKENS = frozenset({"komisyon", "komisyonu", "masraf", "masrafi", "ucret", "ucreti"})


def is_bank_fee_description(description: str) -> bool:
    """True when the bank line description looks like a bank charge, not a payment."""
    normalized = _normalize_fee_text(description)
    if not normalized:
        return False

    if not any(pattern.search(normalized) for pattern in _FEE_PATTERNS):
        return False

    tokens = [t for t in normalized.split() if not re.fullmatch(r"\d+[.,]\d{2}", t)]
    if len(tokens) == 1 and tokens[0] in _BARE_FEE_TOKENS:
        return False

    return True
