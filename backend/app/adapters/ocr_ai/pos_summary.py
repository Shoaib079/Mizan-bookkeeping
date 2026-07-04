"""POS daily-summary photo OCR v1 — text heuristics (Decisions §9)."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any

from app.core.money import amount_text_to_kurus


@dataclass
class PosSummaryExtraction:
    summary_date: date | None
    cash_kurus: int
    card_kurus: int
    total_kurus: int
    raw: dict[str, Any] = field(default_factory=dict)


class PosSummaryExtractionError(ValueError):
    """Structured extraction failed — caller may route to needs_review."""


class PosSummaryUnsupportedError(PosSummaryExtractionError):
    """Image/text extraction insufficient; full vision OCR lands in a later slice."""


def _parse_date(text: str) -> date | None:
    match = re.search(
        r"(?:Tarih|Date|Gun|Gün)\s*[:\.]?\s*(\d{2}[./-]\d{2}[./-]\d{4})",
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


def _parse_text_heuristics(text: str) -> PosSummaryExtraction:
    """Best-effort regex on POS Z-report text — v1 only; unknown layouts fail."""
    cash_match = re.search(
        r"(?:Nakit|Cash)\s*[:\.]?\s*([\d.,]+)",
        text,
        re.IGNORECASE,
    )
    card_match = re.search(
        r"(?:Kart|Kredi\s*Kart|Card|Credit\s*Card)\s*[:\.]?\s*([\d.,]+)",
        text,
        re.IGNORECASE,
    )
    total_match = re.search(
        r"(?:Toplam|Genel\s*Toplam|Total)\s*[:\.]?\s*([\d.,]+)",
        text,
        re.IGNORECASE,
    )
    if not cash_match or not card_match or not total_match:
        raise PosSummaryUnsupportedError(
            "Could not find cash, card, and total amounts in document text"
        )

    cash_kurus = amount_text_to_kurus(cash_match.group(1))
    card_kurus = amount_text_to_kurus(card_match.group(1))
    total_kurus = amount_text_to_kurus(total_match.group(1))

    return PosSummaryExtraction(
        summary_date=_parse_date(text),
        cash_kurus=cash_kurus,
        card_kurus=card_kurus,
        total_kurus=total_kurus,
        raw={"source": "text_heuristics", "text_length": len(text)},
    )


def extract_pos_summary(content: bytes) -> PosSummaryExtraction:
    """Extract POS daily-summary fields from UTF-8 text heuristics."""
    text = _decode_text(content)
    if not text.strip():
        raise PosSummaryUnsupportedError(
            "Image contains no extractable text; vision OCR is planned for a later slice"
        )
    return _parse_text_heuristics(text)


def math_valid(cash_kurus: int, card_kurus: int, total_kurus: int) -> bool:
    return cash_kurus + card_kurus == total_kurus


def extraction_to_payload(extraction: PosSummaryExtraction) -> dict[str, Any]:
    payload = asdict(extraction)
    if extraction.summary_date is not None:
        payload["summary_date"] = extraction.summary_date.isoformat()
    else:
        payload["summary_date"] = None
    return payload
