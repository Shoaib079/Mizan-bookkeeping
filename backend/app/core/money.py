"""Money as integer kuruş — the only money type (Decisions §5, CURSOR_RULES §1)."""

from __future__ import annotations

Kurus = int


def kurus_from_lira(lira: int, kurus_part: int = 0) -> Kurus:
    """Build kuruş from whole lira and fractional kuruş (0–99)."""
    if kurus_part < 0 or kurus_part > 99:
        raise ValueError("kurus_part must be 0–99")
    return lira * 100 + kurus_part


def format_try(amount_kurus: Kurus) -> str:
    """Display Turkish lira format: 1.234,56 ₺"""
    sign = "-" if amount_kurus < 0 else ""
    abs_kurus = abs(amount_kurus)
    lira, kurus = divmod(abs_kurus, 100)
    lira_str = f"{lira:,}".replace(",", ".")
    return f"{sign}{lira_str},{kurus:02d} ₺"


def _frac_digits_to_kurus(frac: str) -> int:
    """Fractional digits → kuruş, rounded half-up (never truncated).

    XML/UBL amounts can carry 3+ decimals; truncating silently loses money, so
    the third digit rounds. May return 100 — callers add it to lira × 100, which
    carries correctly.
    """
    if not frac:
        return 0
    digits = frac[:3].ljust(3, "0")
    kurus = int(digits[:2])
    if int(digits[2]) >= 5:
        kurus += 1
    return kurus


def _parse_turkish_amount(text: str) -> Kurus:
    """The one Turkish amount parser (ARCHITECTURE: never two of these).

    Turkish convention: comma is the decimal separator, dot groups thousands.
    A dotted amount whose final group is exactly 3 digits is thousands-grouped
    (`1.234` = 1.234,00 ₺), not a decimal — reading it as 1,23 ₺ understated
    OCR'd amounts by 1000× (FINANCIAL_AUDIT F1).
    """
    cleaned = text.strip().replace("₺", "").replace("TL", "").replace(" ", "")
    if not cleaned:
        raise ValueError("empty amount")
    negative = cleaned.startswith("-") or cleaned.startswith("(")
    cleaned = cleaned.lstrip("-(").rstrip(")")
    if not cleaned:
        raise ValueError("empty amount")

    if "," in cleaned:
        # Comma always wins as the decimal point; dots before it are grouping.
        whole, frac = cleaned.rsplit(",", 1)
        whole = whole.replace(".", "")
    elif "." in cleaned:
        parts = cleaned.split(".")
        if len(parts) > 1 and len(parts[-1]) <= 2:
            # Final group of 1–2 digits can't be a thousands group → decimal.
            whole, frac = "".join(parts[:-1]), parts[-1]
        else:
            whole, frac = cleaned.replace(".", ""), ""
    else:
        whole, frac = cleaned, ""

    if not whole:
        whole = "0"
    if not whole.isdigit() or (frac and not frac.isdigit()):
        raise ValueError(f"invalid amount text: {text!r}")

    value = int(whole) * 100 + _frac_digits_to_kurus(frac)
    return -value if negative else value


def decimal_text_to_kurus(text: str) -> Kurus:
    """Parse a machine-format decimal amount (UBL/XML): dot is ALWAYS the point.

    Must not go through the Turkish parser: UBL writes `1234.500` for 1.234,50,
    which the thousands-grouping rule would read as 1.234.500 — a 1000×
    overstatement. Rounds half-up rather than truncating (FINANCIAL_AUDIT F1).
    """
    cleaned = text.strip().replace(" ", "")
    if not cleaned:
        raise ValueError("empty amount")
    negative = cleaned.startswith("-")
    cleaned = cleaned.lstrip("-")
    if not any(char.isdigit() for char in cleaned):
        raise ValueError(f"invalid decimal amount: {text!r}")
    if cleaned.count(".") > 1:
        raise ValueError(f"invalid decimal amount: {text!r}")
    whole, _, frac = cleaned.partition(".")
    if not whole:
        whole = "0"
    if not whole.isdigit() or (frac and not frac.isdigit()):
        raise ValueError(f"invalid decimal amount: {text!r}")
    value = int(whole) * 100 + _frac_digits_to_kurus(frac)
    return -value if negative else value


def amount_text_to_kurus(text: str) -> Kurus:
    """Parse OCR/PDF amount text with Turkish comma/dot rules (no currency suffix)."""
    return _parse_turkish_amount(text)


def parse_try_loose(text: str) -> Kurus:
    """Forgiving parser for Turkish-style amounts (Decisions §5)."""
    return _parse_turkish_amount(text)
