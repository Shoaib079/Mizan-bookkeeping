"""Simple CSV bank statement parser — lira amount column."""

from __future__ import annotations

import csv
import io

from app.adapters.bank_parsers.row_parse import (
    REQUIRED_COLUMNS,
    build_parsed_statement,
    parse_statement_line,
)
from app.adapters.bank_parsers.types import BankParseError, ParsedStatement, ParsedStatementLine

# Backward-compatible alias for API error handling.
CsvParseError = BankParseError

__all__ = [
    "CsvParseError",
    "ParsedStatement",
    "ParsedStatementLine",
    "parse_csv_simple",
]


def parse_csv_simple(content: bytes) -> ParsedStatement:
    """Parse CSV with columns transaction_date, amount (lira), description, optional reference."""
    if not content.strip():
        raise BankParseError("CSV file is empty")

    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise BankParseError("CSV header row is missing")

    headers = {h.strip() for h in reader.fieldnames if h}
    missing = REQUIRED_COLUMNS - headers
    if missing:
        raise BankParseError(
            f"CSV missing required columns: {', '.join(sorted(missing))}"
        )

    lines: list[ParsedStatementLine] = []
    for row_num, row in enumerate(reader, start=2):
        if not any(v and str(v).strip() for v in row.values()):
            continue

        reference_raw = row.get("reference")
        reference = reference_raw.strip() if reference_raw and reference_raw.strip() else None
        lines.append(
            parse_statement_line(
                row_num,
                transaction_date=row["transaction_date"],
                amount=row["amount"],
                description=row.get("description") or "",
                reference=reference,
            )
        )

    return build_parsed_statement(lines)
