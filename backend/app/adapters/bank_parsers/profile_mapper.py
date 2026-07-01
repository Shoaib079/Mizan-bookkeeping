"""Map raw bank statement grids using a saved column profile."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.adapters.bank_parsers.amount_lira import DecimalFormat, parse_lira_to_kurus
from app.adapters.bank_parsers.raw_grid import read_raw_grid
from app.adapters.bank_parsers.row_parse import build_parsed_statement, cell_to_str
from app.adapters.bank_parsers.types import BankParseError, ParsedStatement, ParsedStatementLine

DateFormat = Literal["DD.MM.YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]
CsvEncoding = Literal["auto", "utf-8-sig", "cp1254", "latin-1"]
CsvDelimiter = Literal["auto", ";", ",", "\t"]

_DATE_STRPTIME: dict[DateFormat, str] = {
    "DD.MM.YYYY": "%d.%m.%Y",
    "DD/MM/YYYY": "%d/%m/%Y",
    "YYYY-MM-DD": "%Y-%m-%d",
}

# Banks often append time: 30/06/2026-06:26:10 or 01.02.2026 14:30:00
_DATE_WITH_DMY_TIME = re.compile(
    r"^(\d{1,2}[/.]\d{1,2}[/.]\d{4})-\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?$"
)


def normalize_transaction_date_cell(raw: str) -> str:
    """Strip common bank datetime suffixes; leave the calendar date portion."""
    text = raw.strip()
    if not text:
        return text
    if "T" in text:
        return text.split("T", 1)[0]
    if " " in text:
        return text.split()[0]
    match = _DATE_WITH_DMY_TIME.match(text)
    if match:
        return match.group(1)
    return text


def _formats_to_try(preferred: DateFormat, normalized: str) -> list[DateFormat]:
    """Prefer user mapping, then infer separator from the cell text."""
    ordered: list[DateFormat] = [preferred]
    if re.match(r"^\d{4}-\d{2}-\d{2}", normalized) and "YYYY-MM-DD" not in ordered:
        ordered.append("YYYY-MM-DD")
    if "/" in normalized and "DD/MM/YYYY" not in ordered:
        ordered.append("DD/MM/YYYY")
    if "." in normalized and "DD.MM.YYYY" not in ordered:
        ordered.append("DD.MM.YYYY")
    for fmt in ("DD.MM.YYYY", "DD/MM/YYYY", "YYYY-MM-DD"):
        if fmt not in ordered:
            ordered.append(fmt)
    return ordered


class BankImportProfileConfig(BaseModel):
    """Column mapping for non-standard bank exports (1-based row numbers, 0-based columns)."""

    header_row: int = Field(ge=1, description="1-based row index of column headers")
    data_start_row: int = Field(ge=1, description="1-based row index where transactions begin")
    date_col: int = Field(ge=0)
    description_col: int = Field(ge=0)
    reference_col: int | None = Field(default=None, ge=0)
    amount_col: int | None = Field(default=None, ge=0)
    debit_col: int | None = Field(default=None, ge=0)
    credit_col: int | None = Field(default=None, ge=0)
    date_format: DateFormat
    decimal_format: DecimalFormat = "tr"
    debit_is_outflow: bool = Field(
        default=True,
        description="When using debit/credit columns, debit amounts are outflows (negative kuruş)",
    )
    csv_encoding: CsvEncoding = Field(
        default="auto",
        description="CSV text encoding — auto tries utf-8-sig, cp1254, latin-1",
    )
    csv_delimiter: CsvDelimiter = Field(
        default="auto",
        description="CSV field delimiter — auto-detects ; , or tab",
    )

    @model_validator(mode="after")
    def _validate_amount_mode(self) -> BankImportProfileConfig:
        has_amount = self.amount_col is not None
        has_debit_credit = self.debit_col is not None and self.credit_col is not None
        if has_amount == has_debit_credit:
            raise ValueError(
                "Specify either amount_col (signed) or both debit_col and credit_col, not both modes"
            )
        if self.data_start_row < self.header_row:
            raise ValueError("data_start_row must be >= header_row")
        return self

    def required_columns(self) -> list[int]:
        cols = [self.date_col, self.description_col]
        if self.reference_col is not None:
            cols.append(self.reference_col)
        if self.amount_col is not None:
            cols.append(self.amount_col)
        else:
            cols.extend([self.debit_col, self.credit_col])  # type: ignore[list-item]
        return cols

    def max_column_index(self) -> int:
        return max(self.required_columns())


def parse_date_with_format(
    value: object,
    row_num: int,
    date_format: DateFormat,
) -> date:
    if value is None:
        raise BankParseError(f"row {row_num}: transaction date is required")

    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    raw = cell_to_str(value).strip()
    if not raw:
        raise BankParseError(f"row {row_num}: transaction date is required")

    normalized = normalize_transaction_date_cell(raw)
    last_error: ValueError | None = None
    for fmt in _formats_to_try(date_format, normalized):
        strptime_fmt = _DATE_STRPTIME.get(fmt)
        if strptime_fmt is None:
            continue
        try:
            return datetime.strptime(normalized, strptime_fmt).date()
        except ValueError as exc:
            last_error = exc
            continue

    raise BankParseError(
        f"row {row_num}: could not parse date (expected {date_format}), got {raw!r}"
    ) from last_error


def _cell(row: list[object], col: int) -> object:
    if col < 0 or col >= len(row):
        return ""
    return row[col]


def _parse_optional_amount(
    value: object,
    row_num: int,
    *,
    decimal_format: DecimalFormat,
) -> int | None:
    raw = cell_to_str(value).strip()
    if not raw or raw in {"-", "—"}:
        return None
    return parse_lira_to_kurus(raw, row_num, decimal_format=decimal_format)


def _signed_amount_from_row(
    row: list[object],
    row_num: int,
    profile: BankImportProfileConfig,
) -> int | None:
    if profile.amount_col is not None:
        raw = cell_to_str(_cell(row, profile.amount_col)).strip()
        if not raw:
            return None
        return parse_lira_to_kurus(
            raw, row_num, decimal_format=profile.decimal_format
        )

    debit = _parse_optional_amount(
        _cell(row, profile.debit_col),  # type: ignore[arg-type]
        row_num,
        decimal_format=profile.decimal_format,
    )
    credit = _parse_optional_amount(
        _cell(row, profile.credit_col),  # type: ignore[arg-type]
        row_num,
        decimal_format=profile.decimal_format,
    )
    if debit is not None and credit is not None:
        raise BankParseError(
            f"row {row_num}: both debit and credit amounts are set — expected only one"
        )
    if debit is None and credit is None:
        return None

    if profile.debit_is_outflow:
        return -debit if debit is not None else credit  # type: ignore[operator]
    return debit if debit is not None else -credit  # type: ignore[operator]


def _row_is_blank(row: list[object], profile: BankImportProfileConfig) -> bool:
    date_empty = not cell_to_str(_cell(row, profile.date_col)).strip()
    desc_empty = not cell_to_str(_cell(row, profile.description_col)).strip()
    if profile.amount_col is not None:
        amount_empty = not cell_to_str(_cell(row, profile.amount_col)).strip()
    else:
        debit_empty = not cell_to_str(_cell(row, profile.debit_col)).strip()  # type: ignore[arg-type]
        credit_empty = not cell_to_str(_cell(row, profile.credit_col)).strip()  # type: ignore[arg-type]
        amount_empty = debit_empty and credit_empty
    return date_empty and desc_empty and amount_empty


def validate_profile_against_grid(
    grid: list[list[object]],
    profile: BankImportProfileConfig,
) -> None:
    if not grid:
        raise BankParseError("File is empty")

    if profile.header_row > len(grid):
        raise BankParseError(
            f"header_row {profile.header_row} is beyond the file ({len(grid)} rows)"
        )
    if profile.data_start_row > len(grid):
        raise BankParseError(
            f"data_start_row {profile.data_start_row} is beyond the file ({len(grid)} rows)"
        )

    header = grid[profile.header_row - 1]
    max_col = profile.max_column_index()
    if len(header) <= max_col:
        raise BankParseError(
            f"Column mapping references column {max_col} but header row has "
            f"{len(header)} column(s) — check column indices (0-based, first column is 0)"
        )

    sample_row = grid[profile.data_start_row - 1]
    if len(sample_row) <= max_col:
        raise BankParseError(
            f"Column mapping references column {max_col} but first data row has "
            f"{len(sample_row)} column(s) — check column indices"
        )


def _map_row(
    row: list[object],
    row_num: int,
    profile: BankImportProfileConfig,
) -> ParsedStatementLine | None:
    if _row_is_blank(row, profile):
        return None

    txn_date = parse_date_with_format(
        _cell(row, profile.date_col), row_num, profile.date_format
    )
    amount_kurus = _signed_amount_from_row(row, row_num, profile)
    if amount_kurus is None:
        raise BankParseError(f"row {row_num}: amount is required")

    desc = cell_to_str(_cell(row, profile.description_col)).strip()
    if not desc:
        raise BankParseError(f"row {row_num}: description is required")

    ref: str | None = None
    if profile.reference_col is not None:
        ref_raw = cell_to_str(_cell(row, profile.reference_col)).strip()
        ref = ref_raw if ref_raw else None

    return ParsedStatementLine(
        transaction_date=txn_date,
        amount_kurus=amount_kurus,
        description=desc,
        reference=ref,
    )


def parse_with_profile(
    content: bytes,
    profile: BankImportProfileConfig,
    *,
    original_filename: str | None = None,
    content_type: str | None = None,
) -> ParsedStatement:
    grid = read_raw_grid(
        content,
        original_filename=original_filename,
        content_type=content_type,
        csv_encoding=profile.csv_encoding,
        csv_delimiter=profile.csv_delimiter,
    )
    validate_profile_against_grid(grid, profile)

    lines: list[ParsedStatementLine] = []
    for row_idx in range(profile.data_start_row - 1, len(grid)):
        row = grid[row_idx]
        row_num = row_idx + 1
        mapped = _map_row(row, row_num, profile)
        if mapped is not None:
            lines.append(mapped)

    return build_parsed_statement(lines)
