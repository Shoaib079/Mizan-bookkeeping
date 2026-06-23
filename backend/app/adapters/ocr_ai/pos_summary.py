"""POS daily-summary photo OCR v1 — fixture registry + text heuristics (Decisions §9)."""

from __future__ import annotations

import hashlib
import re
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any


@dataclass
class PosSummaryExtraction:
    summary_date: date | None
    cash_kurus: int
    card_kurus: int
    total_kurus: int
    tips_kurus: int = 0
    raw: dict[str, Any] = field(default_factory=dict)


class PosSummaryExtractionError(ValueError):
    """Structured extraction failed — caller may route to needs_review."""


class PosSummaryUnsupportedError(PosSummaryExtractionError):
    """Image/text extraction insufficient; full vision OCR lands in a later slice."""


_FIXTURE_REGISTRY: dict[str, dict[str, Any]] = {}


def register_pos_fixture(content: bytes, fields: dict[str, Any]) -> str:
    """Register known image bytes for deterministic test extraction."""
    fingerprint = hashlib.sha256(content).hexdigest()
    _FIXTURE_REGISTRY[fingerprint] = fields
    return fingerprint


def _amount_to_kurus(text: str) -> int:
    cleaned = text.strip()
    if not cleaned:
        raise ValueError("empty amount")
    negative = cleaned.startswith("-")
    cleaned = cleaned.lstrip("-")
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    parts = cleaned.split(".")
    if len(parts) == 1:
        lira, frac = int(parts[0]), 0
    else:
        lira = int(parts[0])
        frac_str = parts[1][:2].ljust(2, "0")
        frac = int(frac_str)
    value = lira * 100 + frac
    return -value if negative else value


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


def _extract_from_registry(content: bytes) -> PosSummaryExtraction | None:
    fingerprint = hashlib.sha256(content).hexdigest()
    fields = _FIXTURE_REGISTRY.get(fingerprint)
    if fields is None:
        return None
    return PosSummaryExtraction(
        summary_date=fields.get("summary_date"),
        cash_kurus=fields["cash_kurus"],
        card_kurus=fields["card_kurus"],
        total_kurus=fields["total_kurus"],
        tips_kurus=int(fields.get("tips_kurus", 0)),
        raw={"source": "pos_fixture_registry", "fingerprint": fingerprint},
    )


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
    tips_match = re.search(
        r"(?:Bah[sş]i[sş]|Tips?)\s*[:\.]?\s*([\d.,]+)",
        text,
        re.IGNORECASE,
    )
    if not cash_match or not card_match or not total_match:
        raise PosSummaryUnsupportedError(
            "Could not find cash, card, and total amounts in document text"
        )

    cash_kurus = _amount_to_kurus(cash_match.group(1))
    card_kurus = _amount_to_kurus(card_match.group(1))
    total_kurus = _amount_to_kurus(total_match.group(1))
    tips_kurus = _amount_to_kurus(tips_match.group(1)) if tips_match else 0

    return PosSummaryExtraction(
        summary_date=_parse_date(text),
        cash_kurus=cash_kurus,
        card_kurus=card_kurus,
        total_kurus=total_kurus,
        tips_kurus=tips_kurus,
        raw={"source": "text_heuristics", "text_length": len(text)},
    )


def extract_pos_summary(content: bytes) -> PosSummaryExtraction:
    """Extract POS daily-summary fields — fixture registry, then UTF-8 text heuristics."""
    registered = _extract_from_registry(content)
    if registered is not None:
        return registered

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
