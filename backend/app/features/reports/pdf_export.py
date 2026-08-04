"""PDF builders for financial statement exports (Phase 8.5 Slice 5)."""

from __future__ import annotations

from datetime import date, datetime, timezone
from io import BytesIO

from fastapi.responses import StreamingResponse

from app.core.chart_of_accounts.types import AccountType
from app.core.excel.labels import format_journal_source
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

# Brand palette — mirrors the app's design tokens (DESIGN_SYSTEM.md §2).
_BRAND_BLUE = "#2563EB"
_INK = "#0F172A"
_SLATE = "#334155"
_MUTED = "#64748B"
_HAIRLINE = "#E2E8F0"
_BAND = "#F8FAFC"
_NEGATIVE = "#A32D2D"

# Exports are English-only (owner decision 2026-07-13) — figures stay Turkish
# formatted (1.234,56 ₺) because they are lira amounts, not language.


def _fmt_date(value: object) -> str:
    """Turkish date presentation (01.07.2026) — figures and dates stay local."""
    if isinstance(value, (date, datetime)):
        return value.strftime("%d.%m.%Y")
    text = str(value)
    try:
        return datetime.strptime(text, "%Y-%m-%d").strftime("%d.%m.%Y")
    except ValueError:
        return text


def _period_text(from_date: object, to_date: object) -> str:
    return f"{_fmt_date(from_date)} – {_fmt_date(to_date)}"


def _money(amount_kurus: int) -> str:
    """Accounting presentation: negatives in parentheses, never a bare minus."""
    if amount_kurus < 0:
        return f"({format_try(abs(amount_kurus))})"
    return format_try(amount_kurus)


def _is_negative(amount_kurus: int) -> bool:
    return amount_kurus < 0


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


def _build_pdf(
    elements: list,
    *,
    landscape_mode: bool = False,
    footer_left: str = "",
) -> bytes:
    """Render the document; every page gets a hairline footer with page x of y."""
    colors, A4, landscape, _, _, cm, _, SimpleDocTemplate, _, _, _ = _require_reportlab()

    buffer = BytesIO()
    pagesize = landscape(A4) if landscape_mode else A4
    margin = 1.5 * cm

    def _draw_footer(canvas, doc) -> None:
        canvas.saveState()
        width, _height = pagesize
        y = margin * 0.62
        canvas.setStrokeColor(colors.HexColor(_HAIRLINE))
        canvas.setLineWidth(0.5)
        canvas.line(margin, y + 10, width - margin, y + 10)
        canvas.setFont(PDF_FONT_NAME, 7.5)
        canvas.setFillColor(colors.HexColor(_MUTED))
        if footer_left:
            canvas.drawString(margin, y, footer_left)
        canvas.drawRightString(
            width - margin, y, f"Mizan · Page {canvas.getPageNumber()}"
        )
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=pagesize,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin * 1.2,
    )
    doc.build(elements, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
    return buffer.getvalue()


def header_elements(
    *,
    title: str,
    entity_name: str,
    period_label: str,
    period_value: str,
) -> list:
    """Branded masthead: report title + entity, period, and generation stamp."""
    register_bundled_fonts()
    (
        colors,
        _A4,
        _landscape,
        ParagraphStyle,
        getSampleStyleSheet,
        cm,
        Paragraph,
        _SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    ) = _require_reportlab()

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "PdfTitle",
        parent=styles["Normal"],
        fontName=PDF_FONT_BOLD_NAME,
        fontSize=15,
        leading=19,
        textColor=colors.HexColor(_INK),
    )
    sub_style = ParagraphStyle(
        "PdfSub",
        parent=styles["Normal"],
        fontName=PDF_FONT_NAME,
        fontSize=9,
        leading=12,
        textColor=colors.HexColor(_MUTED),
    )
    stamp_style = ParagraphStyle(
        "PdfStamp",
        parent=sub_style,
        alignment=2,  # right
    )

    # Local time, not UTC — these are read by people in the restaurant's timezone.
    generated = datetime.now().strftime("%d.%m.%Y %H:%M")
    masthead = Table(
        [
            [
                Paragraph(_cell(title), title_style),
                Paragraph(_cell("Mizan"), stamp_style),
            ],
            [
                Paragraph(
                    _cell(f"{entity_name} · {period_label}: {period_value}"), sub_style
                ),
                Paragraph(_cell(f"Generated {generated}"), stamp_style),
            ],
        ],
        colWidths=["70%", "30%"],
    )
    masthead.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 6),
                ("LINEBELOW", (0, 1), (-1, 1), 2, colors.HexColor(_BRAND_BLUE)),
            ]
        )
    )
    return [masthead, Spacer(1, 0.45 * cm)]


def summary_band(pairs: list[tuple[str, int]]) -> list:
    """KPI strip — the answer before the detail. Pairs of (label, kuruş)."""
    (
        colors,
        _A4,
        _landscape,
        ParagraphStyle,
        getSampleStyleSheet,
        cm,
        Paragraph,
        _SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    ) = _require_reportlab()
    if not pairs:
        return []

    styles = getSampleStyleSheet()
    label_style = ParagraphStyle(
        "KpiLabel",
        parent=styles["Normal"],
        fontName=PDF_FONT_NAME,
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor(_MUTED),
    )
    value_style = ParagraphStyle(
        "KpiValue",
        parent=styles["Normal"],
        fontName=PDF_FONT_BOLD_NAME,
        fontSize=11.5,
        leading=14,
        textColor=colors.HexColor(_INK),
    )
    negative_value_style = ParagraphStyle(
        "KpiValueNegative",
        parent=value_style,
        textColor=colors.HexColor(_NEGATIVE),
    )

    labels = [Paragraph(_cell(label.upper()), label_style) for label, _ in pairs]
    values = [
        Paragraph(
            _cell(_money(amount)),
            negative_value_style if _is_negative(amount) else value_style,
        )
        for _, amount in pairs
    ]
    band = Table([labels, values], colWidths=[f"{100 / len(pairs):.4f}%"] * len(pairs))
    band.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(_BAND)),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, 0), 7),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 7),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("LINEAFTER", (0, 0), (-2, -1), 0.5, colors.white),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(_HAIRLINE)),
            ]
        )
    )
    return [band, Spacer(1, 0.45 * cm)]


def _table_style(
    *,
    header_rows: int = 1,
    bold_rows: list[int] | None = None,
    section_rows: list[int] | None = None,
    money_cols: tuple[int, ...] = (-1,),
    total_rows: list[int] | None = None,
):
    """Accounting table: hairline rules, right-aligned money, banded sections."""
    colors, _, _, _, _, _, _, _, _, _, TableStyle = _require_reportlab()

    commands: list = [
        ("FONTNAME", (0, 0), (-1, -1), PDF_FONT_NAME),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor(_SLATE)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        # Hairlines between rows only — no full grid.
        ("LINEBELOW", (0, header_rows - 1), (-1, -2), 0.4, colors.HexColor(_HAIRLINE)),
    ]

    # Header: small caps look, dark rule beneath.
    for row in range(header_rows):
        commands.extend(
            [
                ("FONTNAME", (0, row), (-1, row), PDF_FONT_BOLD_NAME),
                ("FONTSIZE", (0, row), (-1, row), 7.5),
                ("TEXTCOLOR", (0, row), (-1, row), colors.HexColor(_MUTED)),
            ]
        )
    commands.append(
        ("LINEBELOW", (0, header_rows - 1), (-1, header_rows - 1), 1, colors.HexColor(_SLATE))
    )

    for col in money_cols:
        commands.append(("ALIGN", (col, 0), (col, -1), "RIGHT"))

    for row in section_rows or []:
        commands.extend(
            [
                ("BACKGROUND", (0, row), (-1, row), colors.HexColor(_BAND)),
                ("FONTNAME", (0, row), (-1, row), PDF_FONT_BOLD_NAME),
                ("FONTSIZE", (0, row), (-1, row), 8),
                ("TEXTCOLOR", (0, row), (-1, row), colors.HexColor(_BRAND_BLUE)),
            ]
        )

    for row in bold_rows or []:
        commands.extend(
            [
                ("FONTNAME", (0, row), (-1, row), PDF_FONT_BOLD_NAME),
                ("TEXTCOLOR", (0, row), (-1, row), colors.HexColor(_INK)),
            ]
        )

    # Grand totals get the classic double rule above.
    for row in total_rows or []:
        commands.extend(
            [
                ("FONTNAME", (0, row), (-1, row), PDF_FONT_BOLD_NAME),
                ("FONTSIZE", (0, row), (-1, row), 9.5),
                ("TEXTCOLOR", (0, row), (-1, row), colors.HexColor(_INK)),
                ("LINEABOVE", (0, row), (-1, row), 1.1, colors.HexColor(_SLATE)),
                ("TOPPADDING", (0, row), (-1, row), 6),
            ]
        )
    return TableStyle(commands)


def build_profit_and_loss_pdf(report: ProfitAndLossRead, entity_name: str) -> bytes:
    _, _, _, _, _, cm, _, _, _, Table, _ = _require_reportlab()

    period = _period_text(report.from_date, report.to_date)
    elements = header_elements(
        title="Profit and Loss",
        entity_name=entity_name,
        period_label="Period",
        period_value=period,
    )
    elements.extend(
        summary_band(
            [
                ("Revenue", report.total_revenue_kurus),
                ("Expenses", -abs(report.total_expenses_kurus)),
                ("Net result", report.net_income_kurus),
            ]
        )
    )

    revenue = [a for a in report.accounts if a.account_type == AccountType.REVENUE]
    expenses = [a for a in report.accounts if a.account_type == AccountType.EXPENSE]
    other = [
        a
        for a in report.accounts
        if a.account_type not in (AccountType.REVENUE, AccountType.EXPENSE)
    ]

    # Account type lives in the section band, so the per-row Type column goes.
    rows: list[list[str]] = [[_cell("Account"), _cell("Name"), _cell("Amount")]]
    section_rows: list[int] = []
    bold_rows: list[int] = []

    def _add_section(label: str, accounts, subtotal: int | None) -> None:
        if not accounts:
            return
        section_rows.append(len(rows))
        rows.append([_cell(label.upper()), "", ""])
        for account in accounts:
            rows.append(
                [
                    _cell(account.code),
                    _cell(account.name_en),
                    _cell(_money(account.amount_kurus)),
                ]
            )
        if subtotal is not None:
            bold_rows.append(len(rows))
            rows.append([_cell(f"Total {label.lower()}"), "", _cell(_money(subtotal))])

    _add_section("Revenue", revenue, report.total_revenue_kurus)
    _add_section("Expenses", expenses, -abs(report.total_expenses_kurus))
    _add_section("Other", other, None)

    total_row = len(rows)
    rows.append([_cell("NET RESULT"), "", _cell(_money(report.net_income_kurus))])

    table = Table(rows, repeatRows=1, colWidths=[3 * cm, 11 * cm, 4 * cm])
    table.setStyle(
        _table_style(
            bold_rows=bold_rows,
            section_rows=section_rows,
            total_rows=[total_row],
            money_cols=(2,),
        )
    )
    elements.append(table)
    return _build_pdf(
        elements,
        footer_left=f"{entity_name} · Profit and Loss · {period}",
    )


def build_balance_sheet_pdf(report: BalanceSheetRead, entity_name: str) -> bytes:
    _, _, _, _, _, cm, _, _, _, Table, _ = _require_reportlab()

    as_of = _fmt_date(report.as_of)
    elements = header_elements(
        title="Balance Sheet",
        entity_name=entity_name,
        period_label="As of",
        period_value=as_of,
    )
    elements.extend(
        summary_band(
            [
                ("Assets", report.total_assets_kurus),
                ("Liabilities", report.liabilities.subtotal_kurus),
                ("Equity", report.equity.subtotal_kurus),
            ]
        )
    )

    rows: list[list[str]] = [[_cell("Account"), _cell("Name"), _cell("Balance")]]
    section_rows: list[int] = []
    bold_rows: list[int] = []

    def _add_section(
        label: str,
        accounts,
        subtotal: int,
        *,
        extra_label: str | None = None,
        extra_kurus: int | None = None,
    ) -> None:
        section_rows.append(len(rows))
        rows.append([_cell(label.upper()), "", ""])
        for account in accounts:
            rows.append(
                [
                    _cell(account.code),
                    _cell(account.name_en),
                    _cell(_money(account.balance_kurus)),
                ]
            )
        if extra_label is not None and extra_kurus is not None:
            rows.append([_cell(""), _cell(extra_label), _cell(_money(extra_kurus))])
        bold_rows.append(len(rows))
        rows.append([_cell(f"Total {label.lower()}"), "", _cell(_money(subtotal))])

    _add_section("Assets", report.assets.accounts, report.assets.subtotal_kurus)
    _add_section(
        "Liabilities", report.liabilities.accounts, report.liabilities.subtotal_kurus
    )
    _add_section(
        "Equity",
        report.equity.accounts,
        report.equity.subtotal_kurus,
        extra_label="Unclosed net income",
        extra_kurus=report.equity.unclosed_net_income_kurus,
    )

    total_rows = [len(rows)]
    rows.append([_cell("TOTAL ASSETS"), "", _cell(_money(report.total_assets_kurus))])
    total_rows.append(len(rows))
    rows.append(
        [
            _cell("TOTAL LIABILITIES AND EQUITY"),
            "",
            _cell(_money(report.total_liabilities_and_equity_kurus)),
        ]
    )
    rows.append(
        [
            _cell("Balanced"),
            _cell("Yes" if report.accounting_equation_balanced else "No — review"),
            "",
        ]
    )

    table = Table(rows, repeatRows=1, colWidths=[3 * cm, 11 * cm, 4 * cm])
    table.setStyle(
        _table_style(
            bold_rows=bold_rows,
            section_rows=section_rows,
            total_rows=total_rows,
            money_cols=(2,),
        )
    )
    elements.append(table)
    return _build_pdf(
        elements,
        footer_left=f"{entity_name} · Balance Sheet · as of {as_of}",
    )


def build_cash_flow_pdf(report: CashFlowRead, entity_name: str) -> bytes:
    (
        _colors,
        _A4,
        _landscape,
        _ParagraphStyle,
        _getSampleStyleSheet,
        cm,
        _Paragraph,
        _SimpleDocTemplate,
        Spacer,
        Table,
        _TableStyle,
    ) = _require_reportlab()

    period = _period_text(report.from_date, report.to_date)
    elements = header_elements(
        title="Cash Flow Statement",
        entity_name=entity_name,
        period_label="Period",
        period_value=period,
    )
    elements.extend(
        summary_band(
            [
                ("Opening cash", report.opening_cash_kurus),
                ("Net change", report.net_change_kurus),
                ("Closing cash", report.closing_cash_kurus),
            ]
        )
    )

    rows: list[list[str]] = [[_cell("Movement"), _cell("Inflows"), _cell("Outflows"), _cell("Net")]]
    section_rows: list[int] = []
    bold_rows: list[int] = []

    for label, block in (
        ("Operating", report.operating),
        ("Investing", report.investing),
        ("Financing", report.financing),
    ):
        section_rows.append(len(rows))
        rows.append([_cell(label.upper()), "", "", ""])
        bold_rows.append(len(rows))
        rows.append(
            [
                _cell(f"{label} activities"),
                _cell(_money(block.inflows_kurus)),
                _cell(_money(-abs(block.outflows_kurus))),
                _cell(_money(block.net_kurus)),
            ]
        )

    total_row = len(rows)
    rows.append(
        [
            _cell("NET CHANGE IN CASH"),
            "",
            "",
            _cell(_money(report.net_change_kurus)),
        ]
    )

    table = Table(rows, repeatRows=1, colWidths=[7 * cm, 3.7 * cm, 3.7 * cm, 3.6 * cm])
    table.setStyle(
        _table_style(
            bold_rows=bold_rows,
            section_rows=section_rows,
            total_rows=[total_row],
            money_cols=(1, 2, 3),
        )
    )
    elements.append(table)
    elements.append(Spacer(1, 0.5 * cm))

    source_rows: list[list[str]] = [
        [_cell("Where the cash came from / went"), _cell("Category"), _cell("Net cash")]
    ]
    for source_row in report.by_source:
        source_rows.append(
            [
                _cell(format_journal_source(source_row.source)),
                _cell(source_row.category.title()),
                _cell(_money(source_row.net_cash_kurus)),
            ]
        )

    source_table = Table(source_rows, repeatRows=1, colWidths=[9 * cm, 5 * cm, 4 * cm])
    source_table.setStyle(_table_style(money_cols=(2,)))
    elements.append(source_table)
    return _build_pdf(
        elements,
        footer_left=f"{entity_name} · Cash Flow · {period}",
    )


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
