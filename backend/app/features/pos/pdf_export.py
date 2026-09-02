"""PDF export for POS daily sales summaries."""

from __future__ import annotations

from datetime import date

from app.core.dates import format_date, format_period
from app.core.excel.workbook import money_header
from app.core.money import format_try
from app.core.pdf.fonts import PDF_FONT_BOLD_NAME, PDF_FONT_NAME, register_bundled_fonts
from app.features.pos.schema import PosDailySummaryRead
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


def build_pos_daily_summaries_pdf(
    *,
    entity_name: str,
    from_date: date,
    to_date: date,
    review_label: str,
    summaries: list[PosDailySummaryRead],
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
    body_style = ParagraphStyle(
        "PosSalesCell",
        parent=styles["Normal"],
        fontName=PDF_FONT_NAME,
        fontSize=8.5,
        leading=10.5,
        textColor=colors.HexColor(_SLATE),
        alignment=0,
    )
    money_style = ParagraphStyle(
        "PosSalesMoney", parent=body_style, alignment=2
    )
    money_out_style = ParagraphStyle(
        "PosSalesMoneyOut",
        parent=money_style,
        textColor=colors.HexColor(_NEGATIVE),
    )
    header_left_style = ParagraphStyle(
        "PosSalesHeaderLeft",
        parent=body_style,
        fontName=PDF_FONT_BOLD_NAME,
        fontSize=7.5,
        leading=9,
        textColor=colors.HexColor(_MUTED),
        alignment=0,
    )
    header_right_style = ParagraphStyle(
        "PosSalesHeaderRight",
        parent=header_left_style,
        alignment=2,
    )

    def cell_para(text: str, style: ParagraphStyle = body_style) -> Paragraph:
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
        title="POS daily sales",
        entity_name=entity_name,
        period_label="Period",
        period_value=format_period(from_date, to_date),
    )
    elements.append(cell_para(f"Filter: {review_label}", body_style))
    elements.append(Spacer(1, 0.45 * cm))

    table_data: list[list] = [
        [
            cell_para("Date", header_left_style),
            cell_para("Status", header_left_style),
            cell_para(money_header("Cash"), header_right_style),
            cell_para(money_header("Card"), header_right_style),
            cell_para(money_header("Total"), header_right_style),
            cell_para(money_header("Z report"), header_right_style),
            cell_para("Review reason", header_left_style),
        ]
    ]
    cash_total = 0
    card_total = 0
    total_total = 0
    for summary in summaries:
        cash_total += summary.cash_kurus
        card_total += summary.card_kurus
        total_total += summary.total_kurus
        table_data.append(
            [
                cell_para(
                    format_date(summary.summary_date) if summary.summary_date else "—",
                    body_style,
                ),
                cell_para(summary.status),
                money_para(summary.cash_kurus),
                money_para(summary.card_kurus),
                money_para(summary.total_kurus),
                money_para(summary.z_report_kurus),
                cell_para(summary.review_reason or ""),
            ]
        )
    table_data.append(
        [
            cell_para("TOTAL", header_left_style),
            cell_para("", body_style),
            money_para(cash_total),
            money_para(card_total),
            money_para(total_total),
            cell_para("", body_style),
            cell_para("", body_style),
        ]
    )

    col_widths = ("10%", "10%", "12%", "12%", "12%", "12%", "32%")
    table = Table(table_data, repeatRows=1, colWidths=list(col_widths))
    table.setStyle(_table_style(money_cols=(2, 3, 4, 5)))
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(table)
    return _build_pdf(
        elements,
        landscape_mode=True,
        footer_left=f"{entity_name} · POS daily sales",
    )


def export_pos_daily_summaries_pdf(
    session,
    entity_id: uuid.UUID,
    *,
    from_date: date,
    to_date: date,
    review: str | None = None,
) -> tuple[bytes, str]:
    from app.db.session import entity_context
    from app.core.listing import fetch_all_scalars
    from app.features.entities import service as entity_service
    from app.features.pos.daily_summary_service import (
        _REVIEW_FILTER_LABELS,
        _daily_summary_list_stmt,
        _require_entity,
        _to_read,
    )
    from app.features.reports.excel_export import export_filename

    if from_date > to_date:
        raise ValueError("from must be on or before to")

    _require_entity(session, entity_id)
    review_key = review or "all"
    review_label = _REVIEW_FILTER_LABELS.get(review_key, review_key)

    with entity_context(session, entity_id):
        stmt = _daily_summary_list_stmt(
            from_date=from_date,
            to_date=to_date,
            review=review if review != "all" else None,
        )
        summaries = fetch_all_scalars(session, stmt)

    entity_name = getattr(entity_service.get_entity(session, entity_id), "name", None) or "books"
    reads = [_to_read(summary) for summary in summaries]
    data = build_pos_daily_summaries_pdf(
        entity_name=entity_name,
        from_date=from_date,
        to_date=to_date,
        review_label=review_label,
        summaries=reads,
    )
    filename = export_filename(
        "pos-sales",
        entity_name=entity_name,
        from_date=from_date,
        to_date=to_date,
        extension=".pdf",
    )
    return data, filename
