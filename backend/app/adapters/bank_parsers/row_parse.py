"""Shared row parsing for CSV and Excel bank statement imports."""

from __future__ import annotations

from datetime import date, datetime

from app.adapters.bank_parsers.amount_lira import parse_lira_to_kurus
from app.adapters.bank_parsers.types import BankParseError, ParsedStatement, ParsedStatementLine

REQUIRED_COLUMNS = frozenset({"transaction_date", "amount", "description"})
OPTIONAL_COLUMNS = frozenset({"reference"})


def parse_transaction_date(value: str, row_num: int) -> date:
    raw = value.strip()
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise BankParseError(
            f"row {row_num}: transaction_date must be YYYY-MM-DD, got {raw!r}"
        ) from exc


def coerce_transaction_date(
    value: object,
    row_num: int,
    *,
    xlrd_datemode: int | None = None,
) -> date:
    """Normalize Excel/CSV date cells: datetime, date, xlrd serial, or ISO string."""
    if value is None:
        raise BankParseError(f"row {row_num}: transaction_date is required")

    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    if isinstance(value, float) and xlrd_datemode is not None:
        try:
            import xlrd.xldate

            return xlrd.xldate.xldate_as_datetime(value, xlrd_datemode).date()
        except (ValueError, OverflowError) as exc:
            raise BankParseError(
                f"row {row_num}: transaction_date must be YYYY-MM-DD, got {value!r}"
            ) from exc

    if isinstance(value, (int, float)):
        raise BankParseError(
            f"row {row_num}: transaction_date must be YYYY-MM-DD, got {value!r}"
        )

    raw = str(value).strip()
    if not raw:
        raise BankParseError(f"row {row_num}: transaction_date is required")
    return parse_transaction_date(raw, row_num)


def cell_to_str(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return ""
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return format(value, ".15g")
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip()


def parse_statement_line(
    row_num: int,
    *,
    transaction_date: object,
    amount: object,
    description: object,
    reference: object | None = None,
    xlrd_datemode: int | None = None,
) -> ParsedStatementLine:
    txn_date = coerce_transaction_date(
        transaction_date, row_num, xlrd_datemode=xlrd_datemode
    )
    amount_kurus = parse_lira_to_kurus(cell_to_str(amount), row_num)
    desc = cell_to_str(description).strip()
    if not desc:
        raise BankParseError(f"row {row_num}: description is required")
    ref_raw = cell_to_str(reference) if reference is not None else ""
    ref = ref_raw if ref_raw else None
    return ParsedStatementLine(
        transaction_date=txn_date,
        amount_kurus=amount_kurus,
        description=desc,
        reference=ref,
    )


def build_parsed_statement(lines: list[ParsedStatementLine]) -> ParsedStatement:
    if not lines:
        raise BankParseError("Statement contains no transaction rows")
    dates = [line.transaction_date for line in lines]
    return ParsedStatement(
        lines=lines,
        period_start=min(dates),
        period_end=max(dates),
    )
