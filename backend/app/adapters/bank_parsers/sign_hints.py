"""Detect likely amount sign inversion after bank import parsing."""

from __future__ import annotations

import re
import unicodedata

_INFLOW_HINTS = re.compile(
    r"POS|NET\s*SAT|KART|TAHSILAT|TAHSİLAT|GELEN|YATIR|DEPOSIT|"
    r"TRENDYOL|GETIR|YEMEK|MIGROS|MARKETPLACE|SETTLEMENT|ODEME\s*AL",
    re.IGNORECASE,
)
_OUTFLOW_HINTS = re.compile(
    r"ODEME|ÖDEME|HAVALE|EFT|FAST|GONDER|GÖNDER|GIDEN|KOMISYON|KOMİSYON|"
    r"MASRAF|UCRET|ÜCRET|BSM|BSMV|WITHDRAW|CHARGE|TEDARIK|Tedarik",
    re.IGNORECASE,
)
_LOAN_INFLOW_HINTS = re.compile(r"KREDI\s*KULL|LOAN\s*PROCEED|KREDI\s*TAHS", re.IGNORECASE)
_LOAN_OUTFLOW_HINTS = re.compile(r"KREDI\s*ODEM|LOAN\s*REPAY|TAKSIT|TAKSİT", re.IGNORECASE)
# Negation immediately before a hint word ("not a deposit", "no pos", "degil tahsilat").
_NEGATED_HINT_PREFIX = re.compile(
    r"\b(?:not|no|non|never|without|degil|yok|hayir)\b"
    r"(?:\s+(?:a|an|the|her|his|bir))?\s*$",
    re.IGNORECASE,
)


def _norm(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _has_unnegated_hint(pattern: re.Pattern[str], text: str) -> bool:
    """True when pattern matches and the match is not negated in the preceding text."""
    for match in pattern.finditer(text):
        prefix = text[max(0, match.start() - 40) : match.start()]
        if _NEGATED_HINT_PREFIX.search(prefix):
            continue
        return True
    return False


def import_sign_review_reason(description: str, amount_kurus: int) -> str | None:
    """Return a review reason when description hints contradict parsed amount sign."""
    if amount_kurus == 0:
        return None

    text = _norm(description)
    if not text:
        return None

    if amount_kurus < 0:
        if _has_unnegated_hint(_LOAN_INFLOW_HINTS, text):
            return (
                "Amount sign may be inverted — description looks like loan proceeds "
                "(inflow) but amount is negative. Check Borç/Alacak or debit_is_outflow mapping."
            )
        if _has_unnegated_hint(_INFLOW_HINTS, text) and not _has_unnegated_hint(
            _OUTFLOW_HINTS, text
        ):
            return (
                "Amount sign may be inverted — description looks like an inflow "
                "(POS, delivery, or collection) but amount is negative. "
                "Check Borç/Alacak or debit_is_outflow mapping."
            )

    if amount_kurus > 0:
        if _has_unnegated_hint(_LOAN_OUTFLOW_HINTS, text):
            return (
                "Amount sign may be inverted — description looks like a loan repayment "
                "(outflow) but amount is positive. Check Borç/Alacak or debit_is_outflow mapping."
            )
        if _has_unnegated_hint(_OUTFLOW_HINTS, text) and not _has_unnegated_hint(
            _INFLOW_HINTS, text
        ):
            return (
                "Amount sign may be inverted — description looks like a payment or charge "
                "(outflow) but amount is positive. "
                "Check Borç/Alacak or debit_is_outflow mapping."
            )

    return None
