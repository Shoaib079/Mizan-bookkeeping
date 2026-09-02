"""FX hub ledger Excel/PDF export — merged movements across wallets."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from app.core.dates import format_date, format_period
from app.core.excel.workbook import (
    create_workbook,
    finish_data_table,
    money_header,
    quantity_header,
    save_workbook_to_bytes,
    write_date,
    write_header_row,
    write_money,
    write_quantity,
    write_sheet_title,
)
from app.core.money import format_minor_units, format_try
from app.core.pdf.fonts import PDF_FONT_BOLD_NAME, PDF_FONT_NAME, register_bundled_fonts
from app.features.reports.pdf_export import (
    PdfExportDependencyError,
    _MUTED,
    _NEGATIVE,
    _SLATE,
    _build_pdf,
    _cell,
    _table_style,
    header_elements,
)


@dataclass(frozen=True)
class FxLedgerExportRow:
    movement_date: date
    wallet_name: str
    wallet_currency: str
    movement_type: str
    description: str
    native_quantity: int
    try_cost_kurus: int


@dataclass(frozen=True)
class FxLedgerExport:
    entity_name: str
    from_date: date
    to_date: date
    wallet_label: str
    rows: Sequence[FxLedgerExportRow]

    @property
    def title(self) -> str:
        return "Foreign currency ledger"


def _fx_header(native_hdr: str) -> list[str]:
    return [
        "Date",
        "Wallet",
        "Currency",
        "Type",
        "Description",
        native_hdr,
        money_header("TRY cost"),
    ]


def _native_column_header(rows: Sequence[FxLedgerExportRow]) -> str:
    currencies = {row.wallet_currency for row in rows}
    if len(currencies) == 1:
        return quantity_header(next(iter(currencies)), "FX")
    return "FX amount"


def build_fx_ledger_xlsx(export: FxLedgerExport) -> bytes:
    wb, ws = create_workbook("FX ledger")
    native_hdr = _native_column_header(export.rows)
    header_row = write_sheet_title(
        ws,
        export.title,
        subtitles=[
            f"Entity: {export.entity_name}",
            f"Period: {format_period(export.from_date, export.to_date)}",
            f"Wallets: {export.wallet_label}",
        ],
        end_col=7,
    )
    row = write_header_row(ws, header_row, _fx_header(native_hdr))

    for entry in export.rows:
        write_date(ws, row, 1, entry.movement_date)
        ws.cell(row=row, column=2, value=entry.wallet_name)
        ws.cell(row=row, column=3, value=entry.wallet_currency)
        ws.cell(row=row, column=4, value=entry.movement_type)
        ws.cell(row=row, column=5, value=entry.description)
        write_quantity(ws, row, 6, abs(entry.native_quantity))
        write_money(ws, row, 7, entry.try_cost_kurus)
        row += 1

    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(row - 1, header_row),
        end_col=7,
        money_cols=(7,),
    )
    return save_workbook_to_bytes(wb)


def build_fx_ledger_pdf(export: FxLedgerExport) -> bytes:
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
    native_hdr = _native_column_header(export.rows)

    styles = getSampleStyleSheet()
    body_style = ParagraphStyle(
        "FxLedgerCell",
        parent=styles["Normal"],
        fontName=PDF_FONT_NAME,
        fontSize=8.5,
        leading=10.5,
        textColor=colors.HexColor(_SLATE),
        alignment=0,
    )
    money_style = ParagraphStyle(
        "FxLedgerMoney", parent=body_style, alignment=2
    )
    money_out_style = ParagraphStyle(
        "FxLedgerMoneyOut",
        parent=money_style,
        textColor=colors.HexColor(_NEGATIVE),
    )
    header_left_style = ParagraphStyle(
        "FxLedgerHeaderLeft",
        parent=body_style,
        fontName=PDF_FONT_BOLD_NAME,
        fontSize=7.5,
        leading=9,
        textColor=colors.HexColor(_MUTED),
        alignment=0,
    )
    header_right_style = ParagraphStyle(
        "FxLedgerHeaderRight",
        parent=header_left_style,
        alignment=2,
    )

    def cell_para(text: str, style: ParagraphStyle = body_style) -> Paragraph:
        safe = _cell(text).replace("&", "&amp;").replace("<", "&lt;")
        return Paragraph(safe, style)

    def money_para(amount_minor: int) -> Paragraph:
        return cell_para(
            format_try(amount_minor),
            money_out_style if amount_minor < 0 else money_style,
        )

    elements: list = header_elements(
        title=export.title,
        entity_name=export.entity_name,
        period_label="Period",
        period_value=format_period(export.from_date, export.to_date),
    )
    elements.append(
        cell_para(f"Wallets: {export.wallet_label}", body_style)
    )
    elements.append(Spacer(1, 0.45 * cm))

    table_data: list[list] = [
        [
            cell_para("Date", header_left_style),
            cell_para("Wallet", header_left_style),
            cell_para("Currency", header_left_style),
            cell_para("Type", header_left_style),
            cell_para("Description", header_left_style),
            cell_para(native_hdr, header_right_style),
            cell_para(money_header("TRY cost"), header_right_style),
        ]
    ]
    for entry in export.rows:
        table_data.append(
            [
                cell_para(format_date(entry.movement_date), body_style),
                cell_para(entry.wallet_name),
                cell_para(entry.wallet_currency),
                cell_para(entry.movement_type),
                cell_para(entry.description),
                cell_para(
                    format_minor_units(
                        abs(entry.native_quantity), entry.wallet_currency
                    ),
                    money_style,
                ),
                money_para(entry.try_cost_kurus),
            ]
        )

    col_widths = ("9%", "14%", "8%", "10%", "33%", "13%", "13%")
    table = Table(table_data, repeatRows=1, colWidths=list(col_widths))
    table.setStyle(_table_style(money_cols=(5, 6)))
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(table)
    return _build_pdf(
        elements,
        landscape_mode=True,
        footer_left=f"{export.entity_name} · FX ledger",
    )
