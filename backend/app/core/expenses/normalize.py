"""Turkish-aware text normalization for expense item spelling tolerance (Decisions §22)."""

from __future__ import annotations

import difflib
import re

FUZZY_MATCH_THRESHOLD = 0.85

_WHITESPACE_RE = re.compile(r"\s+")


def normalize_expense_item_text(text: str) -> str:
    """Lowercase with Turkish locale rules and collapse whitespace."""
    if not text:
        return ""

    lowered: list[str] = []
    for char in text.strip():
        if char == "I":
            lowered.append("ı")
        elif char == "İ":
            lowered.append("i")
        else:
            lowered.append(char.casefold())

    collapsed = _WHITESPACE_RE.sub(" ", "".join(lowered))
    return collapsed.strip()


def similarity_score(a: str, b: str) -> float:
    """Ratio of similarity on normalized strings (0.0–1.0)."""
    norm_a = normalize_expense_item_text(a)
    norm_b = normalize_expense_item_text(b)
    if not norm_a and not norm_b:
        return 1.0
    if not norm_a or not norm_b:
        return 0.0
    return difflib.SequenceMatcher(None, norm_a, norm_b).ratio()
