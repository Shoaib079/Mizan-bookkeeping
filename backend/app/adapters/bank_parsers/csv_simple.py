"""Simple CSV bank statement parser — v1 production format."""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import date, datetime


class CsvParseError(ValueError):
    """Raised when CSV content is invalid or missing required columns."""


REQUIRED_COLUMNS = frozenset({"transaction_date", "amount_kurus", "description"})
OPTIONAL_COLUMNS = frozenset({"reference"})


@dataclass(frozen=True, slots=True)
class ParsedStatementLine:
    transaction_date: date
    amount_kurus: int
    description: str
    reference: str | None


@dataclass(frozen=True, slots=True)
class ParsedStatement:
    lines: list[ParsedStatementLine]
    period_start: date
    period_end: date


def _parse_date(value: str, row_num: int) -> date:
    raw = value.strip()
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise CsvParseError(
            f"row {row_num}: transaction_date must be YYYY-MM-DD, got {raw!r}"
        ) from exc


def _parse_amount(value: str, row_num: int) -> int:
    raw = value.strip()
    if not raw:
        raise CsvParseError(f"row {row_num}: amount_kurus is required")
    try:
        amount = int(raw)
    except ValueError as exc:
        raise CsvParseError(
            f"row {row_num}: amount_kurus must be a signed integer, got {raw!r}"
        ) from exc
    if amount == 0:
        raise CsvParseError(f"row {row_num}: amount_kurus must be non-zero")
    return amount


def parse_csv_simple(content: bytes) -> ParsedStatement:
    """Parse CSV with columns transaction_date, amount_kurus, description, optional reference."""
    if not content.strip():
        raise CsvParseError("CSV file is empty")

    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise CsvParseError("CSV header row is missing")

    headers = {h.strip() for h in reader.fieldnames if h}
    missing = REQUIRED_COLUMNS - headers
    if missing:
        raise CsvParseError(
            f"CSV missing required columns: {', '.join(sorted(missing))}"
        )

    lines: list[ParsedStatementLine] = []
    for row_num, row in enumerate(reader, start=2):
        if not any(v and str(v).strip() for v in row.values()):
            continue

        txn_date = _parse_date(row["transaction_date"], row_num)
        amount = _parse_amount(row["amount_kurus"], row_num)
        description = (row.get("description") or "").strip()
        if not description:
            raise CsvParseError(f"row {row_num}: description is required")

        reference_raw = row.get("reference")
        reference = reference_raw.strip() if reference_raw and reference_raw.strip() else None

        lines.append(
            ParsedStatementLine(
                transaction_date=txn_date,
                amount_kurus=amount,
                description=description,
                reference=reference,
            )
        )

    if not lines:
        raise CsvParseError("CSV contains no transaction rows")

    dates = [line.transaction_date for line in lines]
    return ParsedStatement(
        lines=lines,
        period_start=min(dates),
        period_end=max(dates),
    )
