"""Unified document type detection (UX-C).

Combines invoice detection (detect_source_type) and bank statement
format detection (resolve_statement_format) into a single classifier.
"""

from __future__ import annotations

from enum import Enum

from app.adapters.bank_parsers.dispatch import resolve_statement_format
from app.features.invoices.models import InvoiceSourceType
from app.features.invoices.service import detect_source_type


class DocumentType(str, Enum):
    INVOICE = "invoice"
    BANK_STATEMENT = "bank_statement"
    EXPENSE_RECEIPT = "expense_receipt"
    POS_DAILY_SUMMARY = "pos_daily_summary"


class Confidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


_IMAGE_MAGIC = {
    b"\xff\xd8\xff": "jpeg",
    b"\x89PNG": "png",
    b"GIF8": "gif",
    b"RIFF": "webp",
}

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"}

_SPREADSHEET_EXTENSIONS = {".csv", ".xls", ".xlsx"}


def detect_document_type(
    content: bytes,
    *,
    filename: str | None = None,
    content_type: str | None = None,
) -> tuple[DocumentType, Confidence]:
    """Classify a file into one of the supported document types.

    Returns (type, confidence). Never raises — ambiguous files get LOW confidence.
    """
    # 1. Try invoice detection (XML/PDF with invoice markers)
    try:
        source_type = detect_source_type(
            content, filename=filename, content_type=content_type
        )
        if source_type == InvoiceSourceType.EFATURA_XML:
            return DocumentType.INVOICE, Confidence.HIGH
        if source_type == InvoiceSourceType.EFATURA_PDF:
            return DocumentType.INVOICE, Confidence.MEDIUM
    except ValueError:
        pass

    # 2. Bank statement formats (CSV/XLS/XLSX)
    ext_lower = (filename or "").lower()
    ct_lower = (content_type or "").lower()

    is_spreadsheet_ext = any(ext_lower.endswith(e) for e in _SPREADSHEET_EXTENSIONS)
    is_spreadsheet_ct = any(
        t in ct_lower
        for t in ("text/csv", "spreadsheet", "ms-excel", "comma-separated")
    )

    if is_spreadsheet_ext or is_spreadsheet_ct:
        fmt = resolve_statement_format(
            original_filename=filename, content_type=content_type
        )
        if fmt in (".csv", ".xls", ".xlsx"):
            return DocumentType.BANK_STATEMENT, Confidence.HIGH

    # 3. Image files → expense receipt (default) or POS summary
    is_image = _is_image(content, filename, content_type)
    if is_image:
        return DocumentType.EXPENSE_RECEIPT, Confidence.MEDIUM

    # 4. Fallback — unknown file
    return DocumentType.EXPENSE_RECEIPT, Confidence.LOW


def _is_image(
    content: bytes,
    filename: str | None,
    content_type: str | None,
) -> bool:
    for magic in _IMAGE_MAGIC:
        if content.startswith(magic):
            return True
    if filename:
        for ext in _IMAGE_EXTENSIONS:
            if filename.lower().endswith(ext):
                return True
    if content_type and content_type.lower().startswith("image/"):
        return True
    return False
