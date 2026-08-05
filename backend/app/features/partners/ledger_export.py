"""Excel/PDF export for a single partner ledger."""

from __future__ import annotations

from app.core.excel.labels import format_partner_movement
from app.core.excel.workbook import (
    autosize_columns,
    bold_row,
    create_workbook,
    money_header,
    save_workbook_to_bytes,
    write_money,
)
from app.core.ledger.subledger_display import (
    SubledgerDisplayKind,
    is_effective_subledger_row,
)
from app.core.money import format_try
from app.core.pdf.fonts import (
    PDF_FONT_BOLD_NAME,
    PDF_FONT_NAME,
    assert_text_renderable,
    register_bundled_fonts,
)
from app.features.partners.schema import PartnerLedgerRead
from app.features.reports.pdf_export import PdfExportDependencyError, _build_pdf, _cell


def _effective_entries(ledger: PartnerLedgerRead) -> list:
    """The rows a download should contain: the ledger as it now stands.

    `get_partner_ledger` returns the correction history too — the voided
    original and the `Void: …` reversal that cancelled it — tagged with a
    display kind, because the partner screen offers a "show history" toggle.
    A downloaded file has no toggle, so it gets the effective view, which is
    what every other export already does (month pack §staff/fx, general
    ledger). Without this a voided movement reads as a real one: the running
    balance beside it does not move, because `get_partner_ledger` only
    advances the running total on effective rows.
    """
    return [
        entry
        for entry in ledger.entries
        if is_effective_subledger_row(
            getattr(entry, "display_kind", SubledgerDisplayKind.EFFECTIVE)
        )
    ]


def build_partner_ledger_xlsx(
    *,
    entity_name: str,
    partner_name: str,
    ledger: PartnerLedgerRead,
) -> bytes:
    wb, ws = create_workbook("Partner")
    ws.cell(row=1, column=1, value=entity_name)
    ws.cell(row=2, column=1, value=partner_name)
    ws.cell(row=3, column=1, value="Net balance")
    write_money(ws, 3, 2, ledger.net_balance_kurus)
    ws.cell(row=4, column=1, value="Fronted expenses")
    write_money(ws, 4, 2, ledger.balance_kurus)
    ws.cell(row=5, column=1, value="Capital contributed")
    write_money(ws, 5, 2, ledger.capital_contribution_kurus)
    ws.cell(row=6, column=1, value="Profit allocated")
    write_money(ws, 6, 2, ledger.profit_allocated_kurus)
    ws.cell(row=7, column=1, value="Unpaid profit")
    write_money(ws, 7, 2, ledger.unpaid_profit_kurus)
    ws.cell(row=8, column=1, value="Partner loan")
    write_money(ws, 8, 2, ledger.loan_balance_kurus)

    header_row = 10
    headers = [
        "Date",
        "Movement",
        "Description",
        money_header("Amount"),
        money_header("Running"),
        "Status",
    ]
    for col, header in enumerate(headers, start=1):
        ws.cell(row=header_row, column=col, value=header)
    bold_row(ws, header_row, end_col=len(headers))

    row = header_row + 1
    for entry in _effective_entries(ledger):
        kind = (
            entry.display_kind.value
            if hasattr(entry.display_kind, "value")
            else str(entry.display_kind)
        )
        status = "Corrected" if entry.was_corrected else kind.replace("_", " ").title()
        ws.cell(row=row, column=1, value=str(entry.movement_date))
        ws.cell(row=row, column=2, value=format_partner_movement(entry.movement_type))
        ws.cell(row=row, column=3, value=entry.description)
        write_money(ws, row, 4, entry.amount_kurus)
        if entry.running_balance_kurus is not None:
            write_money(ws, row, 5, entry.running_balance_kurus)
        ws.cell(row=row, column=6, value=status)
        row += 1

    autosize_columns(ws)
    return save_workbook_to_bytes(wb)


def build_partner_ledger_pdf(
    *,
    entity_name: str,
    partner_name: str,
    ledger: PartnerLedgerRead,
) -> bytes:
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
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "PartnerLedgerTitle",
        parent=styles["Heading1"],
        fontName=PDF_FONT_BOLD_NAME,
        fontSize=14,
        spaceAfter=6,
    )
    meta_style = ParagraphStyle(
        "PartnerLedgerMeta",
        parent=styles["Normal"],
        fontName=PDF_FONT_NAME,
        fontSize=9,
        spaceAfter=4,
    )

    elements: list = [
        Paragraph(_cell(entity_name), title_style),
        Paragraph(_cell(partner_name), meta_style),
        Paragraph(
            _cell(f"Net balance: {format_try(ledger.net_balance_kurus)}"),
            meta_style,
        ),
        Paragraph(
            _cell(
                f"Fronted: {format_try(ledger.balance_kurus)} · "
                f"Capital: {format_try(ledger.capital_contribution_kurus)} · "
                f"Profit allocated: {format_try(ledger.profit_allocated_kurus)} · "
                f"Unpaid profit: {format_try(ledger.unpaid_profit_kurus)}"
            ),
            meta_style,
        ),
        Spacer(1, 0.4 * cm),
    ]

    table_data: list[list[str]] = [
        [
            _cell("Date"),
            _cell("Movement"),
            _cell("Description"),
            _cell("Amount"),
            _cell("Running"),
        ]
    ]
    for entry in _effective_entries(ledger):
        running = (
            format_try(entry.running_balance_kurus)
            if entry.running_balance_kurus is not None
            else "—"
        )
        table_data.append(
            [
                _cell(str(entry.movement_date)),
                _cell(format_partner_movement(entry.movement_type)),
                _cell(entry.description[:80]),
                _cell(format_try(entry.amount_kurus)),
                _cell(running),
            ]
        )

    table = Table(table_data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), PDF_FONT_BOLD_NAME),
                ("FONTNAME", (0, 1), (-1, -1), PDF_FONT_NAME),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.92, 0.92, 0.92)),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
            ]
        )
    )
    elements.append(table)
    return _build_pdf(elements, landscape_mode=True)
