"""Expense receipt OCR — multi-line daily expense paper (Phase 8.7, Decisions §8, §22).

One uploaded photo → N item lines. Three tiers: fixture registry, UTF-8 text
heuristics, optional vision OCR (strict JSON, env-gated). Every line is a cash
expense (tips use the same pipeline; default GL may differ on review).
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any

from app.config import settings
from app.core.money import parse_try_loose

_TIP_LABEL = r"(?:Bah[sş]i[sş]|Servis(?:\s*[UÜ]creti)?|Tip|Gratuity)"


@dataclass
class ExpenseReceiptLineExtraction:
    description: str
    amount_kurus: int
    is_tip: bool = False


@dataclass
class ExpenseReceiptExtraction:
    expense_date: date | None
    lines: list[ExpenseReceiptLineExtraction]
    receipt_total_kurus: int | None
    raw: dict[str, Any] = field(default_factory=dict)


class ExpenseReceiptExtractionError(ValueError):
    """Structured extraction failed — caller may route to needs_review."""


class ExpenseReceiptUnsupportedError(ExpenseReceiptExtractionError):
    """Image/text extraction insufficient without vision OCR."""


_FIXTURE_REGISTRY: dict[str, dict[str, Any]] = {}


def register_expense_receipt_fixture(content: bytes, fields: dict[str, Any]) -> str:
    """Register known image bytes for deterministic test extraction."""
    fingerprint = hashlib.sha256(content).hexdigest()
    _FIXTURE_REGISTRY[fingerprint] = fields
    return fingerprint


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


def _parse_total(text: str) -> int | None:
    match = re.search(
        r"(?:Toplam|Genel\s*Toplam|Total)\s*[:\.]?\s*(-?[\d.,]+)",
        text,
        re.IGNORECASE,
    )
    if not match:
        return None
    try:
        return parse_try_loose(match.group(1))
    except ValueError:
        return None


def _is_tip_line(description: str) -> bool:
    return bool(re.match(rf"^{_TIP_LABEL}\s*$", description.strip(), re.IGNORECASE)) or bool(
        re.match(rf"^{_TIP_LABEL}\s*[:\.]?", description.strip(), re.IGNORECASE)
    )


def _extract_from_registry(content: bytes) -> ExpenseReceiptExtraction | None:
    fingerprint = hashlib.sha256(content).hexdigest()
    fields = _FIXTURE_REGISTRY.get(fingerprint)
    if fields is None:
        return None
    lines = [
        ExpenseReceiptLineExtraction(
            description=line["description"],
            amount_kurus=int(line["amount_kurus"]),
            is_tip=bool(line.get("is_tip", False)),
        )
        for line in fields.get("lines", [])
    ]
    return ExpenseReceiptExtraction(
        expense_date=fields.get("expense_date"),
        lines=lines,
        receipt_total_kurus=fields.get("receipt_total_kurus"),
        raw={"source": "expense_receipt_fixture_registry", "fingerprint": fingerprint},
    )


def _decode_text(content: bytes) -> str:
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError:
        return ""


def _parse_line(raw_line: str) -> ExpenseReceiptLineExtraction | None:
    stripped = raw_line.strip()
    if not stripped:
        return None
    if re.match(r"^(?:Tarih|Date|Toplam|Genel|Total|FATURA)", stripped, re.IGNORECASE):
        return None

    tip_match = re.match(
        rf"({_TIP_LABEL})\s*[:\.]?\s*(-?[\d.,]+)\s*$",
        stripped,
        re.IGNORECASE,
    )
    if tip_match:
        try:
            amount = parse_try_loose(tip_match.group(2))
        except ValueError:
            return None
        return ExpenseReceiptLineExtraction(
            description=tip_match.group(1),
            amount_kurus=amount,
            is_tip=True,
        )

    item_match = re.match(r"^(.+?)\s+(-?[\d.,]+)\s*$", stripped)
    if item_match is None:
        return None
    description = item_match.group(1).strip()
    if not description:
        return None
    try:
        amount = parse_try_loose(item_match.group(2))
    except ValueError:
        return None
    return ExpenseReceiptLineExtraction(
        description=description,
        amount_kurus=amount,
        is_tip=_is_tip_line(description),
    )


def _parse_text_heuristics(text: str) -> ExpenseReceiptExtraction:
    lines: list[ExpenseReceiptLineExtraction] = []
    for raw_line in text.splitlines():
        parsed = _parse_line(raw_line)
        if parsed is not None:
            lines.append(parsed)
    return ExpenseReceiptExtraction(
        expense_date=_parse_date(text),
        lines=lines,
        receipt_total_kurus=_parse_total(text),
        raw={"source": "text_heuristics", "text_length": len(text)},
    )


def _vision_json_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "expense_date": {"type": ["string", "null"], "description": "DD.MM.YYYY or ISO"},
            "receipt_total_kurus": {"type": ["integer", "null"]},
            "lines": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "description": {"type": "string"},
                        "amount_kurus": {"type": "integer"},
                        "is_tip": {"type": "boolean"},
                    },
                    "required": ["description", "amount_kurus"],
                },
            },
        },
        "required": ["lines"],
    }


def _parse_vision_json(payload: dict[str, Any]) -> ExpenseReceiptExtraction:
    expense_date: date | None = None
    raw_date = payload.get("expense_date")
    if isinstance(raw_date, str) and raw_date.strip():
        parsed = _parse_date(f"Tarih: {raw_date}") or _parse_date(raw_date)
        if parsed is None:
            try:
                expense_date = date.fromisoformat(raw_date.strip())
            except ValueError:
                expense_date = None
        else:
            expense_date = parsed

    lines: list[ExpenseReceiptLineExtraction] = []
    for item in payload.get("lines", []):
        if not isinstance(item, dict):
            continue
        description = str(item.get("description", "")).strip()
        if not description:
            continue
        amount = int(item["amount_kurus"])
        is_tip = bool(item.get("is_tip", False)) or _is_tip_line(description)
        lines.append(
            ExpenseReceiptLineExtraction(
                description=description,
                amount_kurus=amount,
                is_tip=is_tip,
            )
        )

    total = payload.get("receipt_total_kurus")
    receipt_total = int(total) if total is not None else None

    return ExpenseReceiptExtraction(
        expense_date=expense_date,
        lines=lines,
        receipt_total_kurus=receipt_total,
        raw={"source": "vision_ocr"},
    )


def _extract_vision(content: bytes) -> ExpenseReceiptExtraction | None:
    """Optional vision OCR when ``EXPENSE_RECEIPT_VISION_URL`` is configured."""
    url = settings.expense_receipt_vision_url
    if not url:
        return None

    b64 = base64.b64encode(content).decode("ascii")
    body = json.dumps(
        {
            "model": settings.expense_receipt_vision_model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Extract every expense line from this Turkish daily expense "
                                "receipt. Return strict JSON only with expense_date "
                                "(DD.MM.YYYY or null), receipt_total_kurus (integer or null), "
                                "and lines array [{description, amount_kurus, is_tip}]. "
                                "Amounts in whole kuruş (1 TL = 100). Tip lines: Bahşiş/Servis/Tip."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                        },
                    ],
                }
            ],
            "response_format": {"type": "json_object"},
        }
    ).encode("utf-8")

    headers = {"Content-Type": "application/json"}
    if settings.expense_receipt_vision_api_key:
        headers["Authorization"] = f"Bearer {settings.expense_receipt_vision_api_key}"

    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
        raise ExpenseReceiptExtractionError(f"Vision OCR request failed: {exc}") from exc

    content = raw.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not content:
        raise ExpenseReceiptExtractionError("Vision OCR returned empty content")
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ExpenseReceiptExtractionError("Vision OCR returned invalid JSON") from exc
    if not isinstance(parsed, dict):
        raise ExpenseReceiptExtractionError("Vision OCR JSON must be an object")
    result = _parse_vision_json(parsed)
    result.raw["vision_response"] = True
    return result


def extract_expense_receipt(content: bytes) -> ExpenseReceiptExtraction:
    """Extract multi-line expense receipt — fixture, text, then optional vision."""
    registered = _extract_from_registry(content)
    if registered is not None:
        return registered

    text = _decode_text(content)
    if text.strip():
        return _parse_text_heuristics(text)

    vision = _extract_vision(content)
    if vision is not None:
        return vision

    raise ExpenseReceiptUnsupportedError(
        "Image contains no extractable text; configure vision OCR or enter lines manually"
    )

def extraction_to_payload(extraction: ExpenseReceiptExtraction) -> dict[str, Any]:
    payload = asdict(extraction)
    payload["expense_date"] = (
        extraction.expense_date.isoformat() if extraction.expense_date is not None else None
    )
    return payload
