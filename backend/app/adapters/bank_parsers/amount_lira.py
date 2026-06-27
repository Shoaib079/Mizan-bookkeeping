"""Lira amount parsing for bank statement import — mirrors frontend parseTryToKurus."""

from __future__ import annotations

import re
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

from app.adapters.bank_parsers.types import BankParseError

_LETTER_RE = re.compile(r"[a-zA-Z]")


def _parse_try_parts(cleaned: str) -> tuple[str, str] | None:
    """Return (whole_digits, frac_digits) or None — max 2 fractional digits."""
    if not cleaned or not re.fullmatch(r"[\d.,]+", cleaned):
        return None

    if "," in cleaned:
        parts = cleaned.split(",")
        if len(parts) != 2:
            return None
        whole_part, frac_part = parts
        if frac_part and not re.fullmatch(r"\d{0,2}", frac_part):
            return None
        whole = whole_part.replace(".", "")
        if not re.fullmatch(r"\d+", whole):
            return None
        return whole, frac_part

    if "." in cleaned:
        dot_parts = cleaned.split(".")
        last = dot_parts[-1]
        if len(last) <= 2 and len(dot_parts) > 1:
            whole = "".join(dot_parts[:-1])
            if not re.fullmatch(r"\d+", whole) or not re.fullmatch(r"\d{0,2}", last):
                return None
            return whole, last
        whole = cleaned.replace(".", "")
        if not re.fullmatch(r"\d+", whole):
            return None
        return whole, "00"

    if not re.fullmatch(r"\d+", cleaned):
        return None
    return cleaned, "00"


def parse_lira_to_kurus(value: str, row_num: int) -> int:
    """Parse Turkish TRY lira text → signed integer kuruş (Decimal math, no float)."""
    raw = value.strip() if value is not None else ""
    if not raw:
        raise BankParseError(f"row {row_num}: amount is required")

    without_currency = (
        raw.replace("₺", "")
        .replace("TL", "")
        .replace("tl", "")
        .replace(" ", "")
    )
    if not without_currency:
        raise BankParseError(f"row {row_num}: amount is required")
    if _LETTER_RE.search(without_currency):
        raise BankParseError(
            f"row {row_num}: amount must be numeric lira, got {raw!r}"
        )

    negative = False
    cleaned = without_currency
    if cleaned.startswith("-"):
        negative = True
        cleaned = cleaned[1:]
    if not cleaned:
        raise BankParseError(f"row {row_num}: amount is required")

    parts = _parse_try_parts(cleaned)
    if parts is None:
        raise BankParseError(
            f"row {row_num}: amount must be valid lira (max 2 decimals), got {raw!r}"
        )

    whole, frac = parts
    frac_padded = frac.ljust(2, "0")
    if len(frac_padded) > 2:
        raise BankParseError(
            f"row {row_num}: amount must have at most 2 decimal places, got {raw!r}"
        )

    try:
        whole_dec = Decimal(whole)
        frac_dec = Decimal(frac_padded)
        kurus_dec = whole_dec * Decimal(100) + frac_dec
        if negative:
            kurus_dec = -kurus_dec
        kurus_int = int(kurus_dec.to_integral_value(rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError) as exc:
        raise BankParseError(
            f"row {row_num}: amount must be numeric lira, got {raw!r}"
        ) from exc

    if kurus_int == 0:
        raise BankParseError(f"row {row_num}: amount must be non-zero")
    return kurus_int
