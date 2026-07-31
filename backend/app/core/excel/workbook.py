"""Shared openpyxl helpers for report export."""

from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook
from openpyxl.cell.cell import MergedCell
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.workbook import Workbook as WorkbookType
from openpyxl.worksheet.worksheet import Worksheet

# Neutral professional palette — readable in Excel, no brand-purple glow.
_TITLE_FONT = Font(name="Calibri", size=14, bold=True, color="1F2937")
_SUBTITLE_FONT = Font(name="Calibri", size=10, color="4B5563")
_HEADER_FONT = Font(name="Calibri", size=10, bold=True, color="111827")
_HEADER_FILL = PatternFill("solid", fgColor="E5E7EB")
_THIN = Side(style="thin", color="D1D5DB")
_HEADER_BORDER = Border(bottom=Side(style="medium", color="9CA3AF"))
_CELL_BORDER = Border(
    left=_THIN, right=_THIN, top=_THIN, bottom=_THIN
)
_BOLD = Font(name="Calibri", bold=True)


def create_workbook(sheet_title: str = "Report") -> tuple[Workbook, Worksheet]:
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = unique_sheet_title(wb, sheet_title, replace_active=True)
    return wb, ws


def unique_sheet_title(
    wb: WorkbookType, base: str, *, replace_active: bool = False
) -> str:
    """Excel caps titles at 31 characters and rejects duplicates — return a safe unique name."""
    cleaned = " ".join((base or "Sheet").split())
    if not cleaned:
        cleaned = "Sheet"
    # Excel forbids: : \\ / ? * [ ]
    for ch in (":", "\\", "/", "?", "*", "[", "]"):
        cleaned = cleaned.replace(ch, "-")
    stem = cleaned[:31]
    existing = {s.title for s in wb.worksheets}
    if replace_active and wb.active is not None:
        # Active sheet is being renamed; ignore its current title for uniqueness.
        existing.discard(wb.active.title)
    if stem not in existing:
        return stem
    # Truncate stem so " (2)" etc. still fits in 31.
    for n in range(2, 100):
        suffix = f" ({n})"
        candidate = f"{stem[: 31 - len(suffix)]}{suffix}"
        if candidate not in existing:
            return candidate
    return f"{stem[:28]}_{len(existing)}"


def add_sheet(wb: WorkbookType, title: str) -> Worksheet:
    """Append a sheet with a collision-safe title (max 31 chars)."""
    return wb.create_sheet(title=unique_sheet_title(wb, title))


#: Plain numeric format. Deliberately not a literal like "#.##0,00" — Excel
#: renders this per the *reader's* locale, so a Turkish machine shows
#: 1.234,50 and an English one 1,234.50, both from the same file.
MONEY_FORMAT = "#,##0.00"


def money_header(column_name: str = "Amount") -> str:
    return f"{column_name} (₺)"


def quantity_header(currency: str, column_name: str = "Amount held") -> str:
    """Native FX quantity column — currency in the header, not the cell format."""
    code = (currency or "").strip().upper() or "FX"
    return f"{column_name} ({code})"


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
    for col in range(start_col, end_col + 1):
        cell = ws.cell(row=row, column=col)
        cell.font = Font(
            name=cell.font.name or "Calibri",
            size=cell.font.size or 11,
            bold=True,
            color=cell.font.color,
        )


def write_sheet_title(
    ws: Worksheet,
    title: str,
    *,
    subtitles: list[str] | None = None,
    end_col: int = 2,
) -> int:
    """Title + optional subtitle lines. Returns the next free row.

    Does not merge across columns — merges turn neighbouring cells into
    read-only MergedCells and break later writes (period comparison prior
    columns, summary Period/Figures rows).
    """
    del end_col  # reserved for callers; kept for API stability
    ws.cell(row=1, column=1, value=title).font = _TITLE_FONT
    row = 2
    for line in subtitles or []:
        cell = ws.cell(row=row, column=1, value=line)
        cell.font = _SUBTITLE_FONT
        row += 1
    return row + 1  # blank spacer before content


def write_header_row(
    ws: Worksheet, row: int, headers: list[str]
) -> int:
    """Styled column headers. Returns the first data row."""
    for col, header in enumerate(headers, start=1):
        cell = ws.cell(row=row, column=col, value=header)
        cell.font = _HEADER_FONT
        cell.fill = _HEADER_FILL
        cell.border = _HEADER_BORDER
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    return row + 1


def finish_data_table(
    ws: Worksheet,
    *,
    header_row: int,
    last_data_row: int,
    end_col: int,
    freeze_panes: str | None = None,
    autofilter: bool = True,
) -> None:
    """Freeze header, optional AutoFilter, light borders, autosize."""
    if last_data_row >= header_row:
        for r in range(header_row + 1, last_data_row + 1):
            for c in range(1, end_col + 1):
                cell = ws.cell(row=r, column=c)
                left = cell.border.left if cell.border is not None else None
                if left is None or left.style is None:
                    cell.border = _CELL_BORDER
    if freeze_panes is None:
        freeze_panes = f"A{header_row + 1}"
    ws.freeze_panes = freeze_panes
    if autofilter and last_data_row >= header_row:
        ws.auto_filter.ref = (
            f"A{header_row}:{get_column_letter(end_col)}{last_data_row}"
        )
    autosize_columns(ws)


def autosize_columns(
    ws: Worksheet,
    *,
    min_width: int = 10,
    max_width: int = 50,
) -> None:
    for col_cells in ws.columns:
        if not col_cells:
            continue
        # Merged title cells appear in ws.columns and have no column_letter.
        anchor = next(
            (cell for cell in col_cells if not isinstance(cell, MergedCell)),
            None,
        )
        if anchor is None:
            continue
        col_letter = anchor.column_letter
        max_len = min_width
        for cell in col_cells:
            if isinstance(cell, MergedCell) or cell.value is None:
                continue
            max_len = max(max_len, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = min(max_len + 2, max_width)


def save_workbook_to_bytes(wb: Workbook) -> bytes:
    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
