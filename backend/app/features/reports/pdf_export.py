"""PDF builders for financial statement exports (Phase 8.5 Slice 5)."""

from __future__ import annotations

from datetime import date, datetime, timezone
from io import BytesIO

from fastapi.responses import StreamingResponse

from app.core.money import format_try
from app.core.pdf.fonts import (
    PDF_FONT_BOLD_NAME,
    PDF_FONT_NAME,
    assert_text_renderable,
    register_bundled_fonts,
)
from app.features.reports.excel_export import export_filename
from app.features.reports.schema import (
    BalanceSheetRead,
    CashFlowRead,
    ProfitAndLossRead,
)

PDF_CONTENT_TYPE = "application/pdf"


class PdfExportDependencyError(RuntimeError):
    """reportlab is required for PDF export but is not installed."""


def _require_reportlab():
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError as exc:
        raise PdfExportDependencyError(
            "reportlab is required for PDF export; install project dependencies"
        ) from exc
    return (
        colors,
        A4,
        landscape,
        ParagraphStyle,
        getSampleStyleSheet,
        cm,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )


def pdf_response(data: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        BytesIO(data),
        media_type=PDF_CONTENT_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _cell(value: str) -> str:
    assert_text_renderable(value)
    return value


def _build_pdf(elements: list, *, landscape_mode: bool = False) -> bytes:
    _, A4, landscape, _, _, cm, _, SimpleDocTemplate, _, _, _ = _require_reportlab()

    buffer = BytesIO()
    pagesize = landscape(A4) if landscape_mode else A4
    margin = 1.5 * cm
    doc = SimpleDocTemplate(
        buffer,
        pagesize=pagesize,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
    )
    doc.build(elements)
    return buffer.getvalue()


def _header_elements(
    *,
    title: str,
    entity_name: str,
    period_label: str,
    period_value: str,
) -> list:
    register_bundled_fonts()
    (
        _colors,
        _A4,
        _landscape,
        ParagraphStyle,
        getSampleStyleSheet,
        cm,
        Paragraph,
        _SimpleDocTemplate,
        Spacer,
        _Table,
        _TableStyle,
    ) = _require_reportlab()

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "PdfTitle",
        parent=styles["Title"],
        fontName=PDF_FONT_NAME,
    )
    body_style = ParagraphStyle(
        "PdfBody",
        parent=styles["Normal"],
        fontName=PDF_FONT_NAME,
    )
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return [
        Paragraph(f"<b>{_cell(title)}</b>", title_style),
        Paragraph(f"Entity: {_cell(entity_name)}", body_style),
        Paragraph(f"{_cell(period_label)}: {_cell(period_value)}", body_style),
        Paragraph(f"Generated: {_cell(generated)}", body_style),
        Spacer(1, 0.4 * cm),
    ]


def _table_style(*, header_rows: int = 1, bold_rows: list[int] | None = None):
    colors, _, _, _, _, _, _, _, _, _, TableStyle = _require_reportlab()

    commands: list = [
        ("FONTNAME", (0, 0), (-1, -1), PDF_FONT_NAME),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, header_rows - 1), colors.HexColor("#E5E7EB")),
        ("FONTSIZE", (0, 0), (-1, header_rows - 1), 10),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for row in bold_rows or []:
        commands.append(("FONTNAME", (0, row), (-1, row), PDF_FONT_BOLD_NAME))
        commands.append(("FONTSIZE", (0, row), (-1, row), 10))
    return TableStyle(commands)


def build_profit_and_loss_pdf(report: ProfitAndLossRead, entity_name: str) -> bytes:
    _, _, _, _, _, cm, _, _, _, Table, _ = _require_reportlab()

    elements = _header_elements(
        title="Profit and Loss",
        entity_name=entity_name,
        period_label="Period",
        period_value=f"{report.from_date} to {report.to_date}",
    )

    rows: list[list[str]] = [["Code", "Name", "Type", "Amount"]]
    for account in report.accounts:
        rows.append(
            [
                _cell(account.code),
                _cell(account.name_en),
                _cell(account.account_type.value),
                _cell(format_try(account.amount_kurus)),
            ]
        )
    rows.append(["", "", _cell("TOTAL REVENUE"), _cell(format_try(report.total_revenue_kurus))])
    rows.append(["", "", _cell("TOTAL EXPENSES"), _cell(format_try(report.total_expenses_kurus))])
    rows.append(["", "", _cell("NET INCOME"), _cell(format_try(report.net_income_kurus))])

    table = Table(rows, repeatRows=1, colWidths=[2.2 * cm, 7 * cm, 3 * cm, 3.5 * cm])
    table.setStyle(_table_style(bold_rows=[len(rows) - 3, len(rows) - 2, len(rows) - 1]))
    elements.append(table)
    return _build_pdf(elements, landscape_mode=True)


def _balance_sheet_section_rows(
    section_name: str,
    accounts,
    subtotal_kurus: int,
    *,
    extra_label: str | None = None,
    extra_kurus: int | None = None,
) -> list[list[str]]:
    rows: list[list[str]] = [[_cell(section_name), "", "", ""]]
    rows.append([_cell("Code"), _cell("Name"), _cell("Type"), _cell("Balance")])
    for account in accounts:
        rows.append(
            [
                _cell(account.code),
                _cell(account.name_en),
                _cell(account.account_type.value),
                _cell(format_try(account.balance_kurus)),
            ]
        )
    if extra_label is not None and extra_kurus is not None:
        rows.append([_cell(extra_label), "", "", _cell(format_try(extra_kurus))])
    rows.append([_cell(f"{section_name} subtotal"), "", "", _cell(format_try(subtotal_kurus))])
    rows.append(["", "", "", ""])
    return rows


def build_balance_sheet_pdf(report: BalanceSheetRead, entity_name: str) -> bytes:
    _, _, _, _, _, cm, _, _, _, Table, _ = _require_reportlab()

    elements = _header_elements(
        title="Balance Sheet",
        entity_name=entity_name,
        period_label="As of",
        period_value=str(report.as_of),
    )

    rows: list[list[str]] = []
    rows.extend(
        _balance_sheet_section_rows(
            "Assets",
            report.assets.accounts,
            report.assets.subtotal_kurus,
        )
    )
    rows.extend(
        _balance_sheet_section_rows(
            "Liabilities",
            report.liabilities.accounts,
            report.liabilities.subtotal_kurus,
        )
    )
    rows.extend(
        _balance_sheet_section_rows(
            "Equity",
            report.equity.accounts,
            report.equity.subtotal_kurus,
            extra_label="Unclosed net income",
            extra_kurus=report.equity.unclosed_net_income_kurus,
        )
    )
    rows.append([_cell("Total assets"), "", "", _cell(format_try(report.total_assets_kurus))])
    rows.append(
        [
            _cell("Total liabilities and equity"),
            "",
            "",
            _cell(format_try(report.total_liabilities_and_equity_kurus)),
        ]
    )
    rows.append(
        [
            _cell("Accounting equation balanced"),
            _cell(str(report.accounting_equation_balanced)),
            "",
            "",
        ]
    )

    table = Table(rows, colWidths=[5 * cm, 5.5 * cm, 3 * cm, 3.5 * cm])
    table.setStyle(_table_style(bold_rows=[len(rows) - 3, len(rows) - 2, len(rows) - 1]))
    elements.append(table)
    return _build_pdf(elements, landscape_mode=True)


def build_cash_flow_pdf(report: CashFlowRead, entity_name: str) -> bytes:
    _, _, _, _, _, cm, _, _, Spacer, Table, _ = _require_reportlab()

    elements = _header_elements(
        title="Cash Flow Statement",
        entity_name=entity_name,
        period_label="Period",
        period_value=f"{report.from_date} to {report.to_date}",
    )

    summary_rows: list[list[str]] = [[_cell("Metric"), _cell("Amount")]]
    summary_data = [
        ("Opening cash", report.opening_cash_kurus),
        ("Closing cash", report.closing_cash_kurus),
        ("Net change", report.net_change_kurus),
        ("Operating — inflows", report.operating.inflows_kurus),
        ("Operating — outflows", report.operating.outflows_kurus),
        ("Operating — net", report.operating.net_kurus),
        ("Investing — inflows", report.investing.inflows_kurus),
        ("Investing — outflows", report.investing.outflows_kurus),
        ("Investing — net", report.investing.net_kurus),
        ("Financing — inflows", report.financing.inflows_kurus),
        ("Financing — outflows", report.financing.outflows_kurus),
        ("Financing — net", report.financing.net_kurus),
    ]
    for label, value in summary_data:
        summary_rows.append([_cell(label), _cell(format_try(value))])

    summary_table = Table(summary_rows, repeatRows=1, colWidths=[8 * cm, 4 * cm])
    summary_table.setStyle(_table_style())
    elements.append(summary_table)
    elements.append(Spacer(1, 0.5 * cm))

    source_rows: list[list[str]] = [[_cell("Source"), _cell("Category"), _cell("Net cash")]]
    for source_row in report.by_source:
        source_rows.append(
            [
                _cell(source_row.source),
                _cell(source_row.category),
                _cell(format_try(source_row.net_cash_kurus)),
            ]
        )

    source_table = Table(source_rows, repeatRows=1, colWidths=[5 * cm, 4 * cm, 3.5 * cm])
    source_table.setStyle(_table_style())
    elements.append(source_table)
    return _build_pdf(elements, landscape_mode=True)


def pdf_export_filename(
    report_slug: str,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    as_of: date | None = None,
) -> str:
    return export_filename(
        report_slug,
        from_date=from_date,
        to_date=to_date,
        as_of=as_of,
        extension=".pdf",
    )
