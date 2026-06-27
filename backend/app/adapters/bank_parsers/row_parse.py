"""Shared row parsing for CSV and Excel bank statement imports."""

from __future__ import annotations

from datetime import date

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


def cell_to_str(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return ""
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return format(value, ".15g")
    return str(value).strip()


def parse_statement_line(
    row_num: int,
    *,
    transaction_date: str,
    amount: str,
    description: str,
    reference: str | None = None,
) -> ParsedStatementLine:
    txn_date = parse_transaction_date(transaction_date, row_num)
    amount_kurus = parse_lira_to_kurus(amount, row_num)
    desc = description.strip()
    if not desc:
        raise BankParseError(f"row {row_num}: description is required")
    ref = reference.strip() if reference and reference.strip() else None
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
