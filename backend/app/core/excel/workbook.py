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


def format_kurus_label(column_name: str = "Amount") -> str:
    return f"{column_name} (kuruş)"


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
