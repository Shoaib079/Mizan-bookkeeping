"""Legacy Excel .xls bank statement parser (BIFF via xlrd)."""

from __future__ import annotations

from app.adapters.bank_parsers.row_parse import (
    REQUIRED_COLUMNS,
    build_parsed_statement,
    cell_to_str,
    parse_statement_line,
)
from app.adapters.bank_parsers.types import BankParseError, ParsedStatement, ParsedStatementLine


def parse_xls_simple(content: bytes) -> ParsedStatement:
    """Parse first worksheet with transaction_date, amount (lira), description, optional reference."""
    try:
        import xlrd
    except ImportError as exc:
        raise BankParseError(
            "Excel .xls support is unavailable — reinstall backend dependencies (xlrd)."
        ) from exc

    if not content.strip():
        raise BankParseError("Excel file is empty")

    def _cell_value(sheet: xlrd.sheet.Sheet, row_idx: int, col_idx: int) -> object:
        cell = sheet.cell(row_idx, col_idx)
        if cell.ctype == xlrd.XL_CELL_DATE:
            return cell.value
        if cell.ctype == xlrd.XL_CELL_EMPTY:
            return ""
        if cell.ctype == xlrd.XL_CELL_BOOLEAN:
            return ""
        return cell.value

    try:
        workbook = xlrd.open_workbook(file_contents=content)
    except xlrd.XLRDError as exc:
        raise BankParseError(
            "Excel .xls file could not be read — check the file is a valid legacy spreadsheet"
        ) from exc

    try:
        sheet = workbook.sheet_by_index(0)
        if sheet.nrows == 0:
            raise BankParseError("Excel header row is missing")

        headers: list[str] = []
        for col_idx in range(sheet.ncols):
            label = cell_to_str(_cell_value(sheet, 0, col_idx)).strip()
            if label:
                headers.append(label)

        header_set = set(headers)
        missing = REQUIRED_COLUMNS - header_set
        if missing:
            raise BankParseError(
                f"Excel missing required columns: {', '.join(sorted(missing))}"
            )

        col_index = {name: headers.index(name) for name in headers}
        datemode = workbook.datemode

        lines: list[ParsedStatementLine] = []
        for row_idx in range(1, sheet.nrows):
            row_num = row_idx + 1

            def _cell(name: str) -> object:
                idx = col_index.get(name)
                if idx is None:
                    return ""
                if idx >= sheet.ncols:
                    return ""
                return _cell_value(sheet, row_idx, idx)

            if not any(cell_to_str(_cell(name)) for name in REQUIRED_COLUMNS):
                continue

            reference_raw = _cell("reference")
            reference = cell_to_str(reference_raw) if cell_to_str(reference_raw) else None
            lines.append(
                parse_statement_line(
                    row_num,
                    transaction_date=_cell("transaction_date"),
                    amount=_cell("amount"),
                    description=_cell("description"),
                    reference=reference,
                    xlrd_datemode=datemode,
                )
            )

        return build_parsed_statement(lines)
    finally:
        release = getattr(workbook, "release_resources", None)
        if callable(release):
            release()
