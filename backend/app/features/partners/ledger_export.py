"""Excel/PDF export for a single partner ledger."""

from __future__ import annotations

from datetime import date

from app.core.dates import format_date
from app.core.excel.labels import format_partner_movement
from app.core.excel.workbook import (
    autosize_columns,
    bold_row,
    create_workbook,
    money_header,
    save_workbook_to_bytes,
    write_date,
    write_money,
)
from app.core.ledger.subledger_display import (
    SubledgerDisplayKind,
    is_effective_subledger_row,
)
from app.core.money import format_try
from app.core.pdf.fonts import PDF_FONT_NAME, register_bundled_fonts
from app.features.partners.schema import PartnerLedgerRead
from app.features.reports.pdf_export import (
    _NEGATIVE,
    _SLATE,
    PdfExportDependencyError,
    _build_pdf,
    _cell,
    _table_style,
    header_elements,
    summary_band,
)


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
        # A real date cell, not text. `str(movement_date)` wrote "2026-06-30"
        # as a string, which Excel sorts alphabetically and will not filter by
        # month or feed to a formula. write_date carries the app's display
        # format with it, so it reads dd.mm.yyyy while staying a date.
        write_date(ws, row, 1, entry.movement_date)
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
    """Built from the shared report furniture, not its own.

    This used to hand-roll a Heading1 title, four plain meta paragraphs and a
    full-grid table with a grey header band — which is why it read as a
    printout of a table rather than as a statement, next to the P&L and
    balance sheet. Those come from `header_elements` / `summary_band` /
    `_table_style` in reports.pdf_export, so this does too: same masthead,
    same KPI strip, same hairline accounting rules, same page footer.
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
    styles = getSampleStyleSheet()
    body_style = ParagraphStyle(
        "PartnerCell",
        parent=styles["Normal"],
        fontName=PDF_FONT_NAME,
        fontSize=8.5,
        leading=10.5,
        textColor=colors.HexColor(_SLATE),
    )
    money_style = ParagraphStyle(
        "PartnerMoney", parent=body_style, alignment=2  # right
    )
    money_out_style = ParagraphStyle(
        "PartnerMoneyOut",
        parent=money_style,
        textColor=colors.HexColor(_NEGATIVE),
    )

    def cell_para(text: str, style: ParagraphStyle = body_style) -> Paragraph:
        # Paragraph parses its input as markup, so & and < have to be escaped
        # or a description containing them would break the render.
        safe = _cell(text).replace("&", "&amp;").replace("<", "&lt;")
        return Paragraph(safe, style)

    def money_para(amount_kurus: int | None) -> Paragraph:
        if amount_kurus is None:
            return cell_para("—", money_style)
        return cell_para(
            format_try(amount_kurus),
            money_out_style if amount_kurus < 0 else money_style,
        )

    elements: list = header_elements(
        title=f"Partner ledger — {partner_name}",
        entity_name=entity_name,
        period_label="As at",
        period_value=format_date(date.today()),
    )
    # The figures someone opens this to find, before the movements that
    # produced them. Order matches the partner page.
    elements.extend(
        summary_band(
            [
                ("Net balance", ledger.net_balance_kurus),
                ("Fronted expenses", ledger.balance_kurus),
                ("Capital contributed", ledger.capital_contribution_kurus),
                ("Profit allocated", ledger.profit_allocated_kurus),
                ("Unpaid profit", ledger.unpaid_profit_kurus),
                ("Partner loan", ledger.loan_balance_kurus),
            ]
        )
    )
    elements.append(Spacer(1, 0.45 * cm))

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
        table_data.append(
            [
                # dd.mm.yyyy, as everywhere else the app shows a date to a
                # person. `str(movement_date)` printed ISO.
                _cell(format_date(entry.movement_date)),
                cell_para(format_partner_movement(entry.movement_type)),
                # No longer truncated at 80 characters. That cut references
                # mid-string ("… Borç Kodu: 04101 · Bh") while still
                # overflowing, because truncating does not make a string wrap.
                cell_para(entry.description),
                money_para(entry.amount_kurus),
                money_para(entry.running_balance_kurus),
            ]
        )

    table = Table(
        table_data,
        repeatRows=1,
        colWidths=["10%", "16%", "42%", "16%", "16%"],
    )
    # Money columns are right-aligned by the Paragraph styles above, so the
    # table style only needs the header rule and row hairlines. VALIGN TOP
    # keeps a wrapped two-line description level with its date and amount.
    table.setStyle(_table_style(money_cols=()))
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(table)
    return _build_pdf(
        elements,
        landscape_mode=True,
        footer_left=f"{entity_name} · {partner_name}",
    )
