"""Expense-photo OCR v1 — read a cash tip from a receipt photo (Decisions §9, §14, Slice C).

The owner uploads an expense/receipt photo; this adapter reads the **tip** off it
so the service can create a general-expense draft in Needs Review (a tip is a
cash expense — ``Dr <chosen expense> / Cr cash`` — never auto-posted). UTF-8 text
heuristics; real binary images route to Needs Review until vision OCR lands.

Scope is deliberately the tip only (the explicit owner ask). The general receipt
total / line-item read is the manual expenses pipeline's job, not this slice.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any

from app.core.money import parse_try_loose


@dataclass
class ExpensePhotoExtraction:
    expense_date: date | None
    tip_kurus: int
    tip_found: bool
    raw: dict[str, Any] = field(default_factory=dict)


class ExpensePhotoExtractionError(ValueError):
    """Structured extraction failed — caller may route to needs_review."""


class ExpensePhotoUnsupportedError(ExpensePhotoExtractionError):
    """Image/text extraction insufficient; full vision OCR lands in a later slice."""


# Turkish tip labels: Bahşiş / Bahsis / Servis (service), plus English Tip / Gratuity.
_TIP_LABEL = r"(?:Bah[sş]i[sş]|Servis(?:\s*[UÜ]creti)?|Tip|Gratuity)"


def _parse_date(text: str) -> date | None:
    match = re.search(
        r"(?:Tarih|Date|G[uü]n)\s*[:\.]?\s*(\d{2}[./-]\d{2}[./-]\d{4})",
        text,
        re.IGNORECASE,
    )
    if not match:
        return None
    raw = match.group(1).replace("/", "-").replace(".", "-")
    day, month, year = raw.split("-")
    return date(int(year), int(month), int(day))


def _decode_text(content: bytes) -> str:
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError:
        return ""


def _parse_text_heuristics(text: str) -> ExpensePhotoExtraction:
    """Best-effort regex on receipt text — v1 only; finds a labelled tip if present."""
    tip_match = re.search(
        rf"{_TIP_LABEL}\s*[:\.]?\s*(-?[\d.,]+)",
        text,
        re.IGNORECASE,
    )
    if tip_match is None:
        return ExpensePhotoExtraction(
            expense_date=_parse_date(text),
            tip_kurus=0,
            tip_found=False,
            raw={"source": "text_heuristics", "text_length": len(text), "tip_found": False},
        )

    try:
        tip_kurus = parse_try_loose(tip_match.group(1))
    except ValueError as exc:
        raise ExpensePhotoExtractionError(
            f"Found a tip label but could not read the amount: {tip_match.group(1)!r}"
        ) from exc

    return ExpensePhotoExtraction(
        expense_date=_parse_date(text),
        tip_kurus=tip_kurus,
        tip_found=True,
        raw={"source": "text_heuristics", "text_length": len(text), "tip_found": True},
    )


def extract_expense_photo(content: bytes) -> ExpensePhotoExtraction:
    """Extract the cash tip from an expense photo via UTF-8 text heuristics."""
    text = _decode_text(content)
    if not text.strip():
        raise ExpensePhotoUnsupportedError(
            "Image contains no extractable text; vision OCR is planned for a later slice"
        )
    return _parse_text_heuristics(text)


def extraction_to_payload(extraction: ExpensePhotoExtraction) -> dict[str, Any]:
    payload = asdict(extraction)
    payload["expense_date"] = (
        extraction.expense_date.isoformat() if extraction.expense_date is not None else None
    )
    return payload
