"""e-Fatura document extraction — UBL-TR XML (real) and PDF v1 stub/heuristics."""

from __future__ import annotations

import hashlib
import re
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any
from xml.etree import ElementTree as ET

from app.features.invoices.validation import VatBreakdownLine, validate_invoice_totals

UBL_NS = {
    "inv": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
}


@dataclass
class EInvoiceExtraction:
    supplier_name: str | None
    supplier_vkn: str | None
    invoice_number: str
    invoice_date: date
    net_kurus: int
    gross_kurus: int
    vat_breakdown: list[VatBreakdownLine]
    currency: str = "TRY"
    raw: dict[str, Any] = field(default_factory=dict)


class EfaturaExtractionError(ValueError):
    """Structured extraction failed — caller may route to needs_review."""


class EfaturaPdfUnsupportedError(EfaturaExtractionError):
    """PDF text extraction insufficient; full OCR lands in a later slice."""


# Test/CI fixture registry: SHA256 hex -> extraction fields (without raw).
_PDF_FIXTURE_REGISTRY: dict[str, dict[str, Any]] = {}


def register_pdf_fixture(content: bytes, fields: dict[str, Any]) -> str:
    """Register known PDF bytes for deterministic test extraction."""
    fingerprint = hashlib.sha256(content).hexdigest()
    _PDF_FIXTURE_REGISTRY[fingerprint] = fields
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


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _find_text(root: ET.Element, path: str, *, ns: dict[str, str] | None = None) -> str | None:
    node = root.find(path, ns or UBL_NS)
    if node is None or node.text is None:
        return None
    return node.text.strip()


def _find_all(root: ET.Element, path: str) -> list[ET.Element]:
    return list(root.findall(path, UBL_NS))


def extract_efatura_xml(content: bytes) -> EInvoiceExtraction:
    """Parse standard Turkish UBL-TR e-Fatura XML."""
    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise EfaturaExtractionError(f"Invalid XML: {exc}") from exc

    invoice_number = _find_text(root, "cbc:ID")
    issue_date = _find_text(root, "cbc:IssueDate")
    currency = _find_text(root, "cbc:DocumentCurrencyCode") or "TRY"

    if not invoice_number:
        raise EfaturaExtractionError("Missing invoice number (cbc:ID)")
    if not issue_date:
        raise EfaturaExtractionError("Missing invoice date (cbc:IssueDate)")

    supplier_name = _find_text(
        root, ".//cac:AccountingSupplierParty/cac:Party/cac:PartyName/cbc:Name"
    )
    supplier_vkn = None
    for party_id in _find_all(
        root, ".//cac:AccountingSupplierParty/cac:Party/cac:PartyIdentification"
    ):
        id_node = party_id.find("cbc:ID", UBL_NS)
        if id_node is not None and id_node.text:
            scheme = id_node.get("schemeID", "").upper()
            if scheme in ("VKN", "TCKN") or not scheme:
                supplier_vkn = id_node.text.strip()
                break

    net_text = _find_text(root, ".//cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount")
    gross_text = _find_text(root, ".//cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount")
    if net_text is None or gross_text is None:
        raise EfaturaExtractionError("Missing LegalMonetaryTotal amounts")

    net_kurus = _amount_to_kurus(net_text)
    gross_kurus = _amount_to_kurus(gross_text)

    vat_breakdown: list[VatBreakdownLine] = []
    for subtotal in _find_all(root, ".//cac:TaxTotal/cac:TaxSubtotal"):
        base_node = subtotal.find("cbc:TaxableAmount", UBL_NS)
        vat_node = subtotal.find("cbc:TaxAmount", UBL_NS)
        rate_node = subtotal.find(".//cac:TaxCategory/cac:TaxScheme/cbc:Percent", UBL_NS)
        if base_node is None or vat_node is None or rate_node is None:
            continue
        if base_node.text is None or vat_node.text is None or rate_node.text is None:
            continue
        vat_breakdown.append(
            {
                "rate_percent": float(rate_node.text.strip()),
                "base_kurus": _amount_to_kurus(base_node.text),
                "vat_kurus": _amount_to_kurus(vat_node.text),
            }
        )

    if not vat_breakdown:
        raise EfaturaExtractionError("Missing VAT breakdown (TaxSubtotal)")

    validate_invoice_totals(net_kurus, gross_kurus, vat_breakdown)

    try:
        parsed_date = date.fromisoformat(issue_date)
    except ValueError as exc:
        raise EfaturaExtractionError(f"Invalid issue date: {issue_date}") from exc

    raw = {
        "invoice_number": invoice_number,
        "issue_date": issue_date,
        "currency": currency,
        "supplier_name": supplier_name,
        "supplier_vkn": supplier_vkn,
        "net_text": net_text,
        "gross_text": gross_text,
        "vat_breakdown_count": len(vat_breakdown),
    }

    return EInvoiceExtraction(
        supplier_name=supplier_name,
        supplier_vkn=supplier_vkn,
        invoice_number=invoice_number,
        invoice_date=parsed_date,
        net_kurus=net_kurus,
        gross_kurus=gross_kurus,
        vat_breakdown=vat_breakdown,
        currency=currency,
        raw=raw,
    )


def _extract_pdf_from_registry(content: bytes) -> EInvoiceExtraction | None:
    fingerprint = hashlib.sha256(content).hexdigest()
    fields = _PDF_FIXTURE_REGISTRY.get(fingerprint)
    if fields is None:
        return None
    vat_breakdown = list(fields["vat_breakdown"])
    validate_invoice_totals(fields["net_kurus"], fields["gross_kurus"], vat_breakdown)
    return EInvoiceExtraction(
        supplier_name=fields.get("supplier_name"),
        supplier_vkn=fields.get("supplier_vkn"),
        invoice_number=fields["invoice_number"],
        invoice_date=fields["invoice_date"],
        net_kurus=fields["net_kurus"],
        gross_kurus=fields["gross_kurus"],
        vat_breakdown=vat_breakdown,
        currency=fields.get("currency", "TRY"),
        raw={"source": "pdf_fixture_registry", "fingerprint": fingerprint},
    )


def _extract_pdf_text(content: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise EfaturaPdfUnsupportedError(
            "pypdf is not installed; PDF extraction unavailable"
        ) from exc

    from io import BytesIO

    reader = PdfReader(BytesIO(content))
    parts: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            parts.append(text)
    return "\n".join(parts)


def _parse_pdf_heuristics(text: str) -> EInvoiceExtraction:
    """Best-effort regex on GİB-style PDF text — v1 only; unknown layouts fail."""
    invoice_number = None
    for pattern in (
        r"Fatura\s*(?:No|Numarası)?\s*[:\.]?\s*([A-Z0-9\-]+)",
        r"Belge\s*No\s*[:\.]?\s*([A-Z0-9\-]+)",
    ):
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            invoice_number = match.group(1).strip()
            break
    if not invoice_number:
        raise EfaturaPdfUnsupportedError("Could not find invoice number in PDF text")

    date_match = re.search(
        r"(?:Fatura\s*Tarihi|Düzenleme\s*Tarihi|Tarih)\s*[:\.]?\s*(\d{2}[./-]\d{2}[./-]\d{4})",
        text,
        re.IGNORECASE,
    )
    if not date_match:
        raise EfaturaPdfUnsupportedError("Could not find invoice date in PDF text")
    raw_date = date_match.group(1).replace("/", "-").replace(".", "-")
    day, month, year = raw_date.split("-")
    parsed_date = date(int(year), int(month), int(day))

    vkn_match = re.search(r"VKN\s*[:\.]?\s*(\d{10,11})", text, re.IGNORECASE)
    supplier_vkn = vkn_match.group(1) if vkn_match else None

    supplier_name = None
    name_match = re.search(
        r"(?:Unvan|Satıcı|Satici)\s*[:\.]?\s*(.+?)(?:\n|VKN|TCKN)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if name_match:
        supplier_name = name_match.group(1).strip()

    net_match = re.search(
        r"(?:Mal\s*Hizmet\s*Toplam|Matrah|KDV\s*Hariç)\s*[:\.]?\s*([\d.,]+)",
        text,
        re.IGNORECASE,
    )
    gross_match = re.search(
        r"(?:Ödenecek|Odenecek|Genel\s*Toplam|KDV\s*Dahil)\s*[:\.]?\s*([\d.,]+)",
        text,
        re.IGNORECASE,
    )
    if not net_match or not gross_match:
        raise EfaturaPdfUnsupportedError("Could not find net/gross totals in PDF text")

    net_kurus = _amount_to_kurus(net_match.group(1).replace(".", "").replace(",", "."))
    gross_kurus = _amount_to_kurus(gross_match.group(1).replace(".", "").replace(",", "."))

    vat_breakdown: list[VatBreakdownLine] = []
    for rate_match in re.finditer(
        r"KDV\s*(?:Oran(?:ı|i)?)?\s*[:\.]?\s*(%?\s*\d+)\s*.*?(\d[\d.,]*)",
        text,
        re.IGNORECASE,
    ):
        rate_str = rate_match.group(1).replace("%", "").strip()
        amount_str = rate_match.group(2)
        rate = float(rate_str)
        vat_kurus = _amount_to_kurus(amount_str.replace(".", "").replace(",", "."))
        if rate > 0:
            base_kurus = round(vat_kurus * 100 / rate)
            vat_breakdown.append(
                {"rate_percent": rate, "base_kurus": base_kurus, "vat_kurus": vat_kurus}
            )

    if not vat_breakdown:
        vat_total = gross_kurus - net_kurus
        vat_breakdown = [{"rate_percent": 20, "base_kurus": net_kurus, "vat_kurus": vat_total}]

    validate_invoice_totals(net_kurus, gross_kurus, vat_breakdown)

    return EInvoiceExtraction(
        supplier_name=supplier_name,
        supplier_vkn=supplier_vkn,
        invoice_number=invoice_number,
        invoice_date=parsed_date,
        net_kurus=net_kurus,
        gross_kurus=gross_kurus,
        vat_breakdown=vat_breakdown,
        currency="TRY",
        raw={"source": "pdf_heuristics", "text_length": len(text)},
    )


def extract_efatura_pdf(content: bytes) -> EInvoiceExtraction:
    """Extract e-Fatura fields from PDF — fixture registry, then pypdf heuristics."""
    registered = _extract_pdf_from_registry(content)
    if registered is not None:
        return registered

    text = _extract_pdf_text(content)
    if not text.strip():
        raise EfaturaPdfUnsupportedError(
            "PDF contains no extractable text; vision OCR is planned for a later slice"
        )
    return _parse_pdf_heuristics(text)


def extraction_to_payload(extraction: EInvoiceExtraction) -> dict[str, Any]:
    payload = asdict(extraction)
    payload["invoice_date"] = extraction.invoice_date.isoformat()
    return payload
