"""PDF builders for financial statement exports (Phase 8.5 Slice 5)."""

from __future__ import annotations

from datetime import date, datetime, timezone
from io import BytesIO
from pathlib import Path

from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.money import format_try
from app.features.reports.excel_export import export_filename
from app.features.reports.schema import (
    BalanceSheetRead,
    CashFlowRead,
    ProfitAndLossRead,
)

PDF_CONTENT_TYPE = "application/pdf"
_PDF_FONT = "Helvetica"


def _ensure_unicode_font() -> str:
    global _PDF_FONT
    if _PDF_FONT != "Helvetica":
        return _PDF_FONT
    for path in (
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        font_path = Path(path)
        if font_path.is_file():
            pdfmetrics.registerFont(TTFont("PdfUnicode", str(font_path)))
            _PDF_FONT = "PdfUnicode"
            break
    return _PDF_FONT


def pdf_response(data: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        BytesIO(data),
        media_type=PDF_CONTENT_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _build_pdf(elements: list, *, landscape_mode: bool = False) -> bytes:
    buffer = BytesIO()
    pagesize = landscape(A4) if landscape_mode else A4
    doc = SimpleDocTemplate(
        buffer,
        pagesize=pagesize,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
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
    font_name = _ensure_unicode_font()
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "PdfTitle",
        parent=styles["Title"],
        fontName=font_name,
    )
    body_style = ParagraphStyle(
        "PdfBody",
        parent=styles["Normal"],
        fontName=font_name,
    )
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return [
        Paragraph(f"<b>{title}</b>", title_style),
        Paragraph(f"Entity: {entity_name}", body_style),
        Paragraph(f"{period_label}: {period_value}", body_style),
        Paragraph(f"Generated: {generated}", body_style),
        Spacer(1, 0.4 * cm),
    ]


def _table_style(*, header_rows: int = 1, bold_rows: list[int] | None = None) -> TableStyle:
    font_name = _ensure_unicode_font()
    commands: list = [
        ("FONTNAME", (0, 0), (-1, -1), font_name),
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
        commands.append(("FONTNAME", (0, row), (-1, row), font_name))
        commands.append(("FONTSIZE", (0, row), (-1, row), 10))
    return TableStyle(commands)


def build_profit_and_loss_pdf(report: ProfitAndLossRead, entity_name: str) -> bytes:
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
                account.code,
                account.name_en,
                account.account_type.value,
                format_try(account.amount_kurus),
            ]
        )
    rows.append(["", "", "TOTAL REVENUE", format_try(report.total_revenue_kurus)])
    rows.append(["", "", "TOTAL EXPENSES", format_try(report.total_expenses_kurus)])
    rows.append(["", "", "NET INCOME", format_try(report.net_income_kurus)])

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
    rows: list[list[str]] = [[section_name, "", "", ""]]
    rows.append(["Code", "Name", "Type", "Balance"])
    for account in accounts:
        rows.append(
            [
                account.code,
                account.name_en,
                account.account_type.value,
                format_try(account.balance_kurus),
            ]
        )
    if extra_label is not None and extra_kurus is not None:
        rows.append([extra_label, "", "", format_try(extra_kurus)])
    rows.append([f"{section_name} subtotal", "", "", format_try(subtotal_kurus)])
    rows.append(["", "", "", ""])
    return rows


def build_balance_sheet_pdf(report: BalanceSheetRead, entity_name: str) -> bytes:
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
    rows.append(["Total assets", "", "", format_try(report.total_assets_kurus)])
    rows.append(
        [
            "Total liabilities and equity",
            "",
            "",
            format_try(report.total_liabilities_and_equity_kurus),
        ]
    )
    rows.append(
        [
            "Accounting equation balanced",
            str(report.accounting_equation_balanced),
            "",
            "",
        ]
    )

    table = Table(rows, colWidths=[5 * cm, 5.5 * cm, 3 * cm, 3.5 * cm])
    table.setStyle(_table_style(bold_rows=[len(rows) - 3, len(rows) - 2, len(rows) - 1]))
    elements.append(table)
    return _build_pdf(elements, landscape_mode=True)


def build_cash_flow_pdf(report: CashFlowRead, entity_name: str) -> bytes:
    elements = _header_elements(
        title="Cash Flow Statement",
        entity_name=entity_name,
        period_label="Period",
        period_value=f"{report.from_date} to {report.to_date}",
    )

    summary_rows: list[list[str]] = [["Metric", "Amount"]]
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
        summary_rows.append([label, format_try(value)])

    summary_table = Table(summary_rows, repeatRows=1, colWidths=[8 * cm, 4 * cm])
    summary_table.setStyle(_table_style())
    elements.append(summary_table)
    elements.append(Spacer(1, 0.5 * cm))

    source_rows: list[list[str]] = [["Source", "Category", "Net cash"]]
    for source_row in report.by_source:
        source_rows.append(
            [
                source_row.source,
                source_row.category,
                format_try(source_row.net_cash_kurus),
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
