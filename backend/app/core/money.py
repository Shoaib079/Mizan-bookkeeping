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


def parse_try_loose(text: str) -> Kurus:
    """Forgiving parser for Turkish-style amounts (Decisions §5)."""
    cleaned = text.strip().replace("₺", "").replace("TL", "").replace(" ", "")
    if not cleaned:
        raise ValueError("empty amount")
    negative = cleaned.startswith("-") or cleaned.startswith("(")
    cleaned = cleaned.lstrip("-(").rstrip(")")
    if "," in cleaned:
        whole, frac = cleaned.rsplit(",", 1)
        whole = whole.replace(".", "")
        frac = frac[:2].ljust(2, "0")
    elif "." in cleaned:
        parts = cleaned.split(".")
        if len(parts[-1]) <= 2 and len(parts) > 1:
            whole = "".join(parts[:-1])
            frac = parts[-1][:2].ljust(2, "0")
        else:
            whole = cleaned.replace(".", "")
            frac = "00"
    else:
        whole, frac = cleaned, "00"
    value = int(whole) * 100 + int(frac)
    return -value if negative else value
