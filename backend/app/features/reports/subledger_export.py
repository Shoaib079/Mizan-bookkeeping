"""One exporter for every subledger — partner, staff, customer, supplier.

The partner ledger had the only download in the app, and adding three more by
copying it would have produced four copies of the same void-filtering, the
same table, the same PDF furniture, drifting apart the moment one was fixed.

The genuinely different parts turned out to be small: which figures head the
sheet, and what a movement type is called in words. Everything else — the
masthead, the summary strip, the columns, the date handling, dropping voided
rows — is the same statement about a different subject.

Callers convert their own entries into `SubledgerRow` rather than this module
reaching into them, because the four ledgers disagree about field names:
`amount_kurus` for partner, customer and supplier, `amount_minor` for staff.
Partner and customer carry a running balance from their ledger service; the
rest leave the column empty. Normalising at the edge keeps that disagreement
visible in each feature instead of hidden behind getattr here.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date

from app.core.dates import format_date
from app.core.excel.workbook import (
    create_workbook,
    finish_data_table,
    money_header,
    save_workbook_to_bytes,
    write_date,
    write_header_row,
    write_money,
    write_sheet_title,
)
from app.core.ledger.subledger_display import (
    SubledgerDisplayKind,
    is_effective_subledger_row,
)
from app.core.money import format_try
from app.core.pdf.fonts import PDF_FONT_BOLD_NAME, PDF_FONT_NAME, register_bundled_fonts
from app.features.reports.pdf_export import (
    _MUTED,
    _NEGATIVE,
    _SLATE,
    PdfExportDependencyError,
    _build_pdf,
    _cell,
    _table_style,
    header_elements,
    summary_band,
)

#: Where the summary figures start, leaving room for the two title rows.
_SUMMARY_FIRST_ROW = 3

#: One column geometry for the subledger PDF table — header, body, and every
#: repeated page header (``repeatRows=1``). Percentages of the usable width.
#: Amount / Running are the money columns (right-aligned in header and body).
_SUBLEDGER_PDF_COL_WIDTHS: tuple[str, ...] = ("10%", "16%", "42%", "16%", "16%")
_SUBLEDGER_PDF_MONEY_COLS: tuple[int, ...] = (3, 4)

@dataclass(frozen=True)
class SubledgerRow:
    """One movement, with its labels already resolved."""

    movement_date: date
    movement: str
    description: str
    amount_minor: int
    #: Partner and customer ledgers carry one from get_*_ledger; others leave empty.
    running_minor: int | None = None
    status: str = ""


@dataclass(frozen=True)
class SubledgerExport:
    entity_name: str
    #: The person or company this ledger belongs to.
    subject_name: str
    #: "Partner ledger", "Staff ledger" — used in the title and the PDF footer.
    ledger_label: str
    #: Excel worksheet tab name.
    sheet_name: str
    rows: Sequence[SubledgerRow]
    #: Headline figures, in the order they should read. May be empty.
    summary: Sequence[tuple[str, int]] = field(default_factory=tuple)

    @property
    def title(self) -> str:
        return f"{self.ledger_label} — {self.subject_name}"


def subledger_export_filename(
    kind: str,
    subject_name: str,
    *,
    entity_name: str,
    extension: str = ".xlsx",
) -> str:
    """e.g. "partner-ali-yilmaz — India Gate — 06.08.2026.xlsx".

    Shared so the four ledgers name their downloads the same way. Someone with
    a folder of these needs to tell at a glance which restaurant and which
    person a file belongs to, and four hand-rolled formats would not.
    """
    from app.features.reports.excel_export import export_filename, filename_slug

    return export_filename(
        f"{kind}-{filename_slug(subject_name)}",
        entity_name=entity_name,
        as_of=date.today(),
        extension=extension,
    )


def effective_entries(entries: Sequence[object]) -> list:
    """The rows a download should contain: the ledger as it now stands.

    A subledger holds its correction history too — the voided original and the
    `Void: …` reversal that cancelled it — tagged with a display kind, because
    the screens offer a "show history" toggle. A downloaded file has no
    toggle, so an unfiltered export reads as three real movements where only
    one happened, and the running balance beside the dead rows does not move,
    because it only advances on effective ones.
    """
    return [
        entry
        for entry in entries
        if is_effective_subledger_row(
            getattr(entry, "display_kind", SubledgerDisplayKind.EFFECTIVE)
        )
    ]


def row_status(entry: object) -> str:
    """The Status cell: "Corrected", or the display kind in words."""
    display_kind = getattr(entry, "display_kind", SubledgerDisplayKind.EFFECTIVE)
    kind = (
        display_kind.value
        if hasattr(display_kind, "value")
        else str(display_kind)
    )
    if getattr(entry, "was_corrected", False):
        return "Corrected"
    return kind.replace("_", " ").title()


def build_subledger_xlsx(export: SubledgerExport) -> bytes:
    wb, ws = create_workbook(export.sheet_name)
    # The restaurant reads as the title, the subject as the line beneath it.
    write_sheet_title(ws, export.entity_name, subtitles=[export.title])

    row = _SUMMARY_FIRST_ROW
    for label, amount_minor in export.summary:
        ws.cell(row=row, column=1, value=label)
        write_money(ws, row, 2, amount_minor)
        row += 1

    # One blank row between the figures and the movements.
    header_row = row + 1
    headers = [
        "Date",
        "Movement",
        "Description",
        money_header("Amount"),
        money_header("Running"),
        "Status",
    ]
    row = write_header_row(ws, header_row, headers)

    for entry in export.rows:
        # A real date cell, not text. `str(movement_date)` wrote "2026-06-30"
        # as a string, which Excel sorts alphabetically and will not filter by
        # month or feed to a formula. write_date carries the app's display
        # format with it, so it reads dd.mm.yyyy while staying a date.
        write_date(ws, row, 1, entry.movement_date)
        ws.cell(row=row, column=2, value=entry.movement)
        ws.cell(row=row, column=3, value=entry.description)
        write_money(ws, row, 4, entry.amount_minor)
        if entry.running_minor is not None:
            write_money(ws, row, 5, entry.running_minor)
        ws.cell(row=row, column=6, value=entry.status)
        row += 1

    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(row - 1, header_row),
        end_col=6,
        money_cols=(4, 5),
    )
    return save_workbook_to_bytes(wb)


def build_subledger_pdf(export: SubledgerExport) -> bytes:
    """Built from the shared report furniture, not its own.

    Same masthead, KPI strip, hairline rules and footer as the P&L and balance
    sheet, so a ledger reads as a statement rather than as a printed table.
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import Paragraph, Spacer, Table, TableStyle
    except ImportError as exc:
        raise PdfExportDependencyError(
            "reportlab is required for PDF export; install project dependencies"
        ) from exc

    register_bundled_fonts()

    # Descriptions carry whole bank reference strings — account numbers, SGK
    # references, counterparty names — and a plain string in a reportlab table
    # cell does not wrap. It overflows, silently, straight across the Amount
    # and Running columns. Only a Paragraph wraps, so the text columns are
    # Paragraphs and the row grows to fit instead of colliding.
    #
    # Paragraphs also ignore the table's ALIGN command (it only moves plain
    # strings). Headers used to be plain left-aligned "Amount"/"Running" while
    # body money was a right-aligned Paragraph — so the labels sat ~70pt left
    # of the figures. Header and body now share the same Paragraph styles and
    # the same ``_SUBLEDGER_PDF_COL_WIDTHS`` geometry.
    styles = getSampleStyleSheet()
    body_style = ParagraphStyle(
        "SubledgerCell",
        parent=styles["Normal"],
        fontName=PDF_FONT_NAME,
        fontSize=8.5,
        leading=10.5,
        textColor=colors.HexColor(_SLATE),
        alignment=0,  # left — Date / Movement / Description
    )
    money_style = ParagraphStyle(
        "SubledgerMoney", parent=body_style, alignment=2  # right
    )
    money_out_style = ParagraphStyle(
        "SubledgerMoneyOut",
        parent=money_style,
        textColor=colors.HexColor(_NEGATIVE),
    )
    header_left_style = ParagraphStyle(
        "SubledgerHeaderLeft",
        parent=body_style,
        fontName=PDF_FONT_BOLD_NAME,
        fontSize=7.5,
        leading=9,
        textColor=colors.HexColor(_MUTED),
        alignment=0,
    )
    header_right_style = ParagraphStyle(
        "SubledgerHeaderRight",
        parent=header_left_style,
        alignment=2,
    )

    def cell_para(text: str, style: ParagraphStyle = body_style) -> Paragraph:
        # Paragraph parses its input as markup, so & and < have to be escaped
        # or a description containing them would break the render.
        safe = _cell(text).replace("&", "&amp;").replace("<", "&lt;")
        return Paragraph(safe, style)

    def money_para(amount_minor: int | None) -> Paragraph:
        if amount_minor is None:
            return cell_para("—", money_style)
        return cell_para(
            format_try(amount_minor),
            money_out_style if amount_minor < 0 else money_style,
        )

    elements: list = header_elements(
        title=export.title,
        entity_name=export.entity_name,
        period_label="As at",
        period_value=format_date(date.today()),
    )
    # The figures someone opens this to find, before the movements that
    # produced them. Order matches the screen.
    if export.summary:
        elements.extend(summary_band(list(export.summary)))
    elements.append(Spacer(1, 0.45 * cm))

    table_data: list[list] = [
        [
            cell_para("Date", header_left_style),
            cell_para("Movement", header_left_style),
            cell_para("Description", header_left_style),
            cell_para("Amount", header_right_style),
            cell_para("Running", header_right_style),
        ]
    ]
    for entry in export.rows:
        table_data.append(
            [
                # dd.mm.yyyy, as everywhere else the app shows a date to a
                # person. `str(movement_date)` printed ISO. Left-aligned
                # Paragraph so it shares geometry with the header cell.
                cell_para(format_date(entry.movement_date), body_style),
                cell_para(entry.movement),
                # Not truncated. Cutting at 80 characters severed references
                # mid-string while still overflowing, because truncating does
                # not make a string wrap. Fixed Description width keeps money
                # columns from shifting when a note wraps.
                cell_para(entry.description),
                money_para(entry.amount_minor),
                money_para(entry.running_minor),
            ]
        )

    table = Table(
        table_data,
        repeatRows=1,
        colWidths=list(_SUBLEDGER_PDF_COL_WIDTHS),
    )
    # Money columns: Paragraph alignment carries the right edge; money_cols
    # ALIGN is belt-and-suspenders for any plain-string cell. VALIGN TOP keeps
    # a wrapped two-line description level with its date and amount.
    table.setStyle(_table_style(money_cols=_SUBLEDGER_PDF_MONEY_COLS))
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(table)
    return _build_pdf(
        elements,
        landscape_mode=True,
        footer_left=f"{export.entity_name} · {export.subject_name}",
    )
