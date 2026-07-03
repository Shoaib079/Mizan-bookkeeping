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
    invoice_type_code: str | None = None
    referenced_invoice_number: str | None = None
    referenced_invoice_date: date | None = None
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


def _parse_tr_date_token(raw_date: str) -> date:
    cleaned = re.sub(r"\s+", "", raw_date.strip())
    cleaned = cleaned.replace("/", "-").replace(".", "-")
    parts = cleaned.split("-")
    if len(parts) == 3 and len(parts[0]) == 4:
        year, month, day = parts
    elif len(parts) == 3:
        day, month, year = parts
    else:
        raise ValueError(f"Invalid date token: {raw_date!r}")
    return date(int(year), int(month), int(day))


def _parse_invoice_type_code_pdf(text: str) -> str | None:
    match = re.search(r"Fatura\s*Tipi\s*[:\.]?\s*(\w+)", text, re.IGNORECASE)
    if match is None:
        return None
    return match.group(1).strip().upper()


def _parse_billing_references_xml(root: ET.Element) -> tuple[str | None, date | None]:
    for billing_ref in _find_all(root, ".//cac:BillingReference"):
        doc_ref = billing_ref.find("cac:InvoiceDocumentReference", UBL_NS)
        if doc_ref is None:
            continue
        id_node = doc_ref.find("cbc:ID", UBL_NS)
        if id_node is None or not id_node.text:
            continue
        invoice_number = id_node.text.strip()
        referenced_date: date | None = None
        date_node = doc_ref.find("cbc:IssueDate", UBL_NS)
        if date_node is not None and date_node.text:
            try:
                referenced_date = date.fromisoformat(date_node.text.strip())
            except ValueError:
                referenced_date = None
        return invoice_number, referenced_date
    return None, None


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

    invoice_type_code = _find_text(root, "cbc:InvoiceTypeCode")
    if invoice_type_code:
        invoice_type_code = invoice_type_code.strip().upper()
    referenced_invoice_number, referenced_invoice_date = _parse_billing_references_xml(root)

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
        invoice_type_code=invoice_type_code,
        referenced_invoice_number=referenced_invoice_number,
        referenced_invoice_date=referenced_invoice_date,
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
        invoice_type_code=fields.get("invoice_type_code"),
        referenced_invoice_number=fields.get("referenced_invoice_number"),
        referenced_invoice_date=fields.get("referenced_invoice_date"),
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


_TR_DATE_TOKEN = r"\d{2}\s*[./-]\s*\d{2}\s*[./-]\s*\d{4}"


def _parse_referenced_invoice_pdf(text: str) -> tuple[str | None, date | None]:
    block_match = re.search(
        rf"İadeye\s*Konu\s*Olan\s*Faturalar.*?([A-Z0-9\-/]+)\s+({_TR_DATE_TOKEN})",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if block_match is None:
        return None, None
    invoice_number = block_match.group(1).strip()
    try:
        referenced_date = _parse_tr_date_token(block_match.group(2))
    except ValueError:
        return invoice_number, None
    return invoice_number, referenced_date


# Preferred first — accounting invoice date before creation/shipment fallbacks.
_PDF_DATE_LABEL_PATTERNS: tuple[str, ...] = (
    rf"(?:^|\n)\s*Fatura\s*Tarih[iı]?\s*[:\.]?\s*({_TR_DATE_TOKEN})",
    rf"D[uü]zenlen?me\s*Tarih[iı]?\s*[:\.]?\s*({_TR_DATE_TOKEN})",
    rf"Olu[sş]turma\s*Tarih[iı]?\s*[:\.]?\s*({_TR_DATE_TOKEN})",
    rf"Fiili\s*Sevkiyat\s*Tarih[iı]?\s*[:\.]?\s*({_TR_DATE_TOKEN})",
    rf"Fiili\s*Sevk\s*Tarih[iı]?\s*[:\.]?\s*({_TR_DATE_TOKEN})",
    rf"(?:^|[^\w])Tarih\s*[:\.]?\s*({_TR_DATE_TOKEN})",
)

_PDF_AMOUNT = r"([\d.,]+)"
_PDF_AMOUNT_SUFFIX = r"(?:\s*TL)?"

_PDF_NET_LABELS: tuple[str, ...] = (
    r"Malzeme\s*/?\s*Hizmet\s*Toplam\s*Tutar[ıi]?",
    r"Mal\s*/?\s*Hizmet\s*Toplam\s*Tutar[ıi]?",
    r"Mal\s*Hizmet\s*Toplam",
    r"Ayl[ıi]k\s*[ÜU]cretler",
    r"K\.D\.V\.\s*MATRAHI\s*%\s*\d+",
    r"Ara\s*Tutar",
    r"Ara\s*Toplam",
    r"KDV\s*Matrah[ıi]?",
    r"KDV\s*Hari[cç]",
    r"KDV\s*.{0,2}s[iı]z\s*Toplam",
)

_PDF_GROSS_LABELS: tuple[str, ...] = (
    r"Vergiler\s*Dahil\s*Toplam\s*Tutar[ıi]?",
    r"[ÖO]denecek\s*Tutar[ıi]?",
    r"Fatura\s*Toplam[ıi]?",
    r"TOPLAM\s*FATURA\s*TUTARI",
    r"Toplam\s*Tutar",
    r"[ÖO]DENECEK\s*TOPLAM\s*TUTAR",
    r"Genel\s*Toplam",
    r"KDV\s*Dahil",
    r"Br[uü]t\s*Toplam",
    r"Br[uü]t\s*G[ıi]da\s*Top",
    r"[ÖO]denecek",
)


def _parse_pdf_tr_date(text: str) -> date:
    """Parse DD.MM.YYYY from common Turkish e-Fatura PDF labels."""
    for pattern in _PDF_DATE_LABEL_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if not match:
            continue
        raw_date = re.sub(r"\s+", "", match.group(1))
        raw_date = raw_date.replace("/", "-").replace(".", "-")
        day, month, year = raw_date.split("-")
        return date(int(year), int(month), int(day))
    raise EfaturaPdfUnsupportedError("Could not find invoice date in PDF text")


def _find_labeled_amount(text: str, label_patterns: tuple[str, ...]) -> re.Match[str] | None:
    for label in label_patterns:
        match = re.search(
            rf"{label}\s*[:\.]?\s*{_PDF_AMOUNT}{_PDF_AMOUNT_SUFFIX}",
            text,
            re.IGNORECASE,
        )
        if match:
            return match
    return None


def _normalize_tr_amount(amount: str) -> str:
    cleaned = amount.strip()
    if re.fullmatch(r"\d+\.\d{2}", cleaned):
        return cleaned
    return cleaned.replace(".", "").replace(",", ".")


def _collect_tax_ids(text: str) -> list[str]:
    ids: list[str] = []
    for pattern in (
        r"Vergi\s*Numaras[ıi]\s*[:\.]?\s*(\d{10,11})",
        r"Vergi\s*No\s*[:\.]?\s*(\d{10,11})",
        r"VKN\s*[:\.]?\s*(\d{10,11})",
        r"VERG[Iİ]\s*N/D:\s*(\d{10,11})",
        r"Mükellefler.{0,300}?(\d{10,11})",
        r"(\d{10,11})\s+Mersis",
    ):
        for match in re.finditer(pattern, text, re.IGNORECASE | re.DOTALL):
            ids.append(match.group(1))
    return list(dict.fromkeys(ids))


def _buyer_vkn_from_pdf(text: str) -> str | None:
    """Buyer tax id on GİB PDFs — often labeled VERGİ N/D on the delivery block."""
    match = re.search(
        r"VERG[Iİ]\s*N/D:\s*(\d{10,11})",
        text,
        re.IGNORECASE,
    )
    if match:
        return match.group(1)
    buyer_match = re.search(
        r"Vergi\s*Dairesi\s*ve\s*VKN\s*[:\.]?\s*[A-ZÇĞİÖŞÜa-zçğıöşü\s\.]+\s*(\d{10,11})",
        text,
        re.IGNORECASE,
    )
    if buyer_match:
        return buyer_match.group(1)
    # Inverted portal PDFs: SAYIN / buyer block is extracted before seller (Metro) footer.
    sayin_pos = text.upper().find("SAYIN")
    if sayin_pos >= 0:
        buyer_block = text[sayin_pos : sayin_pos + 1500]
        first_vkn = re.search(
            r"VKN\s*[:\.]?\s*(\d{10,11})",
            buyer_block,
            re.IGNORECASE,
        )
        if first_vkn:
            return first_vkn.group(1)
    return None


def _supplier_name_from_pdf(text: str) -> str | None:
    """Best-effort seller name — Metro puts legal name before VKN without Unvan/Satıcı labels."""
    metro_match = re.search(
        r"(METRO\s+GROSMARKET[^\n]+(?:\n[^\n]+)?)",
        text,
        re.IGNORECASE,
    )
    if metro_match:
        return " ".join(metro_match.group(1).split())

    name_match = re.search(
        r"(?:Unvan|Satıcı|Satici)\s*[:\.]?\s*(.+?)(?:\n|VKN|TCKN)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if name_match:
        return name_match.group(1).strip()
    return None


def _header_seller_vkn_candidates(header: str) -> list[str]:
    """Metro-style PDFs put seller VKN as bare digits after Büyük Mükellefler V.D. / Mersis."""
    candidates: list[str] = []
    for pattern in (
        r"Mükellefler.{0,300}?(\d{10,11})",
        r"(\d{10,11})\s+Mersis",
        r"Vergi\s*Numaras[ıi]\s*[:\.]?\s*(\d{10,11})",
        r"Vergi\s*No\s*[:\.]?\s*(\d{10,11})",
        r"VKN\s*[:\.]?\s*(\d{10,11})",
    ):
        for match in re.finditer(pattern, header, re.IGNORECASE | re.DOTALL):
            candidates.append(match.group(1))
    return list(dict.fromkeys(candidates))


def _supplier_vkn_from_pdf(text: str, *, buyer_vkn: str | None = None) -> str | None:
    """Seller tax id — header / before SAYIN; inverted GİB layouts put seller last after SAYIN."""
    buyer = buyer_vkn.strip() if buyer_vkn else None
    if not buyer:
        buyer = _buyer_vkn_from_pdf(text)
    if buyer:
        others = [tax_id for tax_id in _collect_tax_ids(text) if tax_id != buyer]
        if len(others) == 1:
            return others[0]

    header_limit = 2500
    sayin_pos = text.upper().find("SAYIN")
    sevkiyat_pos = text.upper().find("SEVKIYAT")
    if sayin_pos >= 0:
        header = text[:sayin_pos]
    elif sevkiyat_pos >= 0:
        header = text[:sevkiyat_pos]
    else:
        header = text[:header_limit]

    if buyer:
        for candidate in _header_seller_vkn_candidates(header):
            if candidate != buyer:
                return candidate

    for pattern in (
        r"Vergi\s*Numaras[ıi]\s*[:\.]?\s*(\d{10,11})",
        r"Vergi\s*No\s*[:\.]?\s*(\d{10,11})",
    ):
        match = re.search(pattern, header, re.IGNORECASE)
        if match:
            return match.group(1)

    def _collect_vkns(chunk: str) -> list[str]:
        return list(
            dict.fromkeys(
                match.group(1)
                for match in re.finditer(
                    r"VKN\s*[:\.]?\s*(\d{10,11})", chunk, re.IGNORECASE
                )
            )
        )

    header_vkns = _collect_vkns(header)
    if header_vkns:
        return header_vkns[0]

    if sayin_pos >= 0:
        after_sayin = text[sayin_pos + len("SAYIN") :]
        after_vkns = _collect_vkns(after_sayin)
        if len(after_vkns) >= 2:
            return after_vkns[-1]
        if len(after_vkns) == 1:
            return after_vkns[0]

    buyer_match = re.search(
        r"Vergi\s*Dairesi\s*ve\s*VKN\s*[:\.]?\s*[A-ZÇĞİÖŞÜa-zçğıöşü\s\.]+\s*(\d{10,11})",
        text,
        re.IGNORECASE,
    )
    all_vkns = _collect_vkns(text)
    if not all_vkns:
        return None
    if buyer_match:
        buyer_vkn_match = buyer_match.group(1)
        for vkn in all_vkns:
            if vkn != buyer_vkn_match:
                return vkn
    if buyer:
        others = [tax_id for tax_id in _collect_tax_ids(text) if tax_id != buyer]
        if others:
            return others[0]
    return all_vkns[0]


def _parse_pdf_heuristics(text: str, *, buyer_vkn: str | None = None) -> EInvoiceExtraction:
    """Best-effort regex on GİB-style PDF text — v1 only; unknown layouts fail."""
    invoice_number = None
    for pattern in (
        r"Fatura\s*(?:No|Numaras[iı]|NUMARASI)\s*[:\.]?\s*([A-Z0-9\-/]+)",
        r"Fatura\s*Numarası\s*[:\.]?\s*([A-Z0-9\-/]+)",
        r"Belge\s*No\s*[:\.]?\s*([A-Z0-9\-/]+)",
    ):
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            invoice_number = match.group(1).strip()
            break
    if not invoice_number:
        raise EfaturaPdfUnsupportedError("Could not find invoice number in PDF text")

    parsed_date = _parse_pdf_tr_date(text)

    supplier_vkn = _supplier_vkn_from_pdf(text, buyer_vkn=buyer_vkn)

    supplier_name = _supplier_name_from_pdf(text)

    net_match = _find_labeled_amount(text, _PDF_NET_LABELS)
    if not net_match:
        matrah_match = re.search(
            rf"Matrah\s+{_PDF_AMOUNT}\s*TL",
            text,
            re.IGNORECASE,
        )
        if matrah_match:
            net_match = matrah_match

    gross_match = _find_labeled_amount(text, _PDF_GROSS_LABELS)
    if not net_match or not gross_match:
        raise EfaturaPdfUnsupportedError("Could not find net/gross totals in PDF text")

    net_kurus = _amount_to_kurus(_normalize_tr_amount(net_match.group(1)))
    gross_kurus = _amount_to_kurus(_normalize_tr_amount(gross_match.group(1)))

    vat_breakdown: list[VatBreakdownLine] = []
    for rate_match in re.finditer(
        r"Hesaplanan\s*KDV(?:\s*GERCEK)?\s*\(\s*%?\s*(\d+(?:[.,]\d+)?)\s*\)\s*"
        rf"{_PDF_AMOUNT}{_PDF_AMOUNT_SUFFIX}",
        text,
        re.IGNORECASE,
    ):
        rate_str = rate_match.group(1).replace(",", ".")
        amount_str = rate_match.group(2)
        rate = float(rate_str)
        vat_kurus = _amount_to_kurus(_normalize_tr_amount(amount_str))
        if rate > 0:
            base_kurus = round(vat_kurus * 100 / rate)
            vat_breakdown.append(
                {"rate_percent": rate, "base_kurus": base_kurus, "vat_kurus": vat_kurus}
            )

    if not vat_breakdown:
        for rate_match in re.finditer(
            r"K\.D\.V\.\s*%\s*(\d+)\s*[:\.]?\s*"
            rf"{_PDF_AMOUNT}{_PDF_AMOUNT_SUFFIX}?",
            text,
            re.IGNORECASE,
        ):
            rate = float(rate_match.group(1))
            vat_kurus = _amount_to_kurus(_normalize_tr_amount(rate_match.group(2)))
            if rate > 0:
                base_kurus = round(vat_kurus * 100 / rate)
                vat_breakdown.append(
                    {
                        "rate_percent": float(rate),
                        "base_kurus": base_kurus,
                        "vat_kurus": vat_kurus,
                    }
                )

    if not vat_breakdown:
        vat_total = gross_kurus - net_kurus
        vat_breakdown = [{"rate_percent": 20, "base_kurus": net_kurus, "vat_kurus": vat_total}]
    else:
        vat_sum = sum(line["vat_kurus"] for line in vat_breakdown)
        if net_kurus + vat_sum != gross_kurus:
            # Pre-discount Mal Hizmet total or multi-fee utility bill — align net to VAT.
            net_kurus = gross_kurus - vat_sum
            for line in vat_breakdown:
                rate = line["rate_percent"]
                if rate > 0:
                    line["base_kurus"] = round(line["vat_kurus"] * 100 / rate)

    validate_invoice_totals(net_kurus, gross_kurus, vat_breakdown)

    invoice_type_code = _parse_invoice_type_code_pdf(text)
    referenced_invoice_number, referenced_invoice_date = _parse_referenced_invoice_pdf(text)

    return EInvoiceExtraction(
        supplier_name=supplier_name,
        supplier_vkn=supplier_vkn,
        invoice_number=invoice_number,
        invoice_date=parsed_date,
        net_kurus=net_kurus,
        gross_kurus=gross_kurus,
        vat_breakdown=vat_breakdown,
        currency="TRY",
        invoice_type_code=invoice_type_code,
        referenced_invoice_number=referenced_invoice_number,
        referenced_invoice_date=referenced_invoice_date,
        raw={"source": "pdf_heuristics", "text_length": len(text), "text_sample": text[:8000]},
    )


def extract_efatura_pdf(
    content: bytes, *, buyer_vkn: str | None = None
) -> EInvoiceExtraction:
    """Extract e-Fatura fields from PDF — fixture registry, then pypdf heuristics."""
    registered = _extract_pdf_from_registry(content)
    if registered is not None:
        return registered

    text = _extract_pdf_text(content)
    if not text.strip():
        raise EfaturaPdfUnsupportedError(
            "PDF contains no extractable text; vision OCR is planned for a later slice"
        )
    return _parse_pdf_heuristics(text, buyer_vkn=buyer_vkn)


def extraction_to_payload(extraction: EInvoiceExtraction) -> dict[str, Any]:
    payload = asdict(extraction)
    payload["invoice_date"] = extraction.invoice_date.isoformat()
    if extraction.referenced_invoice_date is not None:
        payload["referenced_invoice_date"] = extraction.referenced_invoice_date.isoformat()
    else:
        payload["referenced_invoice_date"] = None
    return payload
