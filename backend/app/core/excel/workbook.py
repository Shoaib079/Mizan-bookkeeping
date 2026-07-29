"""Shared openpyxl helpers for report export."""

from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.worksheet.worksheet import Worksheet


def create_workbook(sheet_title: str = "Report") -> tuple[Workbook, Worksheet]:
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = sheet_title[:31]
    return wb, ws


def add_sheet(wb: Workbook, title: str) -> Worksheet:
    """Append a sheet to an existing workbook.

    Sheet titles are capped at 31 characters by the format itself, and Excel
    silently mangles anything longer rather than telling you.
    """
    return wb.create_sheet(title=title[:31])


#: Plain numeric format. Deliberately not a literal like "#.##0,00" — Excel
#: renders this per the *reader's* locale, so a Turkish machine shows
#: 1.234,50 and an English one 1,234.50, both from the same file.
MONEY_FORMAT = "#,##0.00"


def money_header(column_name: str = "Amount") -> str:
    return f"{column_name} (₺)"


def write_money(ws, row: int, col: int, minor: int | None) -> None:
    """Write a minor-unit amount as lira, still a number Excel can sum.

    Amounts are stored in kuruş so the ledger never touches a float, but a
    column of raw kuruş is unreadable and can't be checked against a statement
    — the owner would have to divide every figure by 100 by hand
    (2026-07-29). Written as a real number, not text, so filters and SUM()
    keep working.
    """
    if minor is None:
        return
    cell = ws.cell(row=row, column=col, value=minor / 100)
    cell.number_format = MONEY_FORMAT


def write_quantity(ws, row: int, col: int, minor: int | None) -> None:
    """A foreign-currency quantity held in minor units — €, $, £, not ₺.

    Arithmetically identical to write_money today, and kept separate anyway:
    these two columns sit side by side on the foreign currency sheet and mean
    different things, so a future change to one (a ₺ symbol in the format, say)
    must not silently follow into the other.
    """
    write_money(ws, row, col, minor)


def bold_row(ws: Worksheet, row: int, *, start_col: int = 1, end_col: int) -> None:
    bold = Font(bold=True)
    for col in range(start_col, end_col + 1):
        ws.cell(row=row, column=col).font = bold


def autosize_columns(
    ws: Worksheet,
    *,
    min_width: int = 10,
    max_width: int = 50,
) -> None:
    for col_cells in ws.columns:
        if not col_cells:
            continue
        col_letter = col_cells[0].column_letter
        max_len = min_width
        for cell in col_cells:
            if cell.value is not None:
                max_len = max(max_len, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = min(max_len + 2, max_width)


def save_workbook_to_bytes(wb: Workbook) -> bytes:
    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
