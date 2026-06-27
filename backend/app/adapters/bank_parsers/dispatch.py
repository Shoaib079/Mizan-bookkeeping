"""Dispatch bank statement parsing by file extension / content type."""

from __future__ import annotations

import mimetypes

from app.adapters.bank_parsers.csv_simple import parse_csv_simple
from app.adapters.bank_parsers.types import BankParseError, ParsedStatement
from app.adapters.bank_parsers.xlsx_simple import parse_xlsx_simple

XLSX_EXTENSIONS = frozenset({".xlsx", ".xls"})
XLSX_CONTENT_TYPES = frozenset(
    {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
    }
)


def _extension_from_filename(filename: str | None) -> str:
    if not filename:
        return ".csv"
    lower = filename.lower()
    for ext in (".xlsx", ".xls", ".csv"):
        if lower.endswith(ext):
            return ext
    guessed = mimetypes.guess_extension(
        mimetypes.guess_type(lower)[0] or "", strict=False
    )
    return guessed or ".csv"


def resolve_statement_format(
    *,
    original_filename: str | None,
    content_type: str | None,
) -> str:
    ext = _extension_from_filename(original_filename)
    if content_type:
        normalized = content_type.split(";", 1)[0].strip().lower()
        if normalized in XLSX_CONTENT_TYPES:
            return ".xlsx"
        if normalized == "text/csv":
            return ".csv"
    return ext


def parse_bank_statement(
    content: bytes,
    *,
    original_filename: str | None = None,
    content_type: str | None = None,
) -> ParsedStatement:
    fmt = resolve_statement_format(
        original_filename=original_filename,
        content_type=content_type,
    )
    if fmt in XLSX_EXTENSIONS:
        return parse_xlsx_simple(content)
    return parse_csv_simple(content)
