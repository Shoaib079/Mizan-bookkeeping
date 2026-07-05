"""Excel export for POS daily sales summaries."""

from __future__ import annotations

import uuid
from datetime import date

from app.core.excel.workbook import (
    autosize_columns,
    bold_row,
    create_workbook,
    format_kurus_label,
    save_workbook_to_bytes,
)
from app.features.pos.schema import PosDailySummaryRead


def build_pos_daily_summaries_xlsx(
    *,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
    review_label: str,
    summaries: list[PosDailySummaryRead],
) -> bytes:
    wb, ws = create_workbook("POS Sales")
    ws.cell(row=1, column=1, value="POS daily sales")
    ws.cell(row=2, column=1, value=f"Entity: {entity_id}")
    ws.cell(row=2, column=2, value=f"Period: {from_date} to {to_date}")
    ws.cell(row=3, column=1, value=f"Filter: {review_label}")

    row = 5
    headers = [
        "Date",
        "Status",
        format_kurus_label("Cash"),
        format_kurus_label("Card"),
        format_kurus_label("Total"),
        format_kurus_label("Z report"),
        "Review reason",
        "Posted at",
    ]
    for col, header in enumerate(headers, start=1):
        ws.cell(row=row, column=col, value=header)
    bold_row(ws, row, end_col=len(headers))
    row += 1

    cash_total = 0
    card_total = 0
    total_total = 0
    for summary in summaries:
        ws.cell(row=row, column=1, value=str(summary.summary_date or ""))
        ws.cell(row=row, column=2, value=summary.status)
        ws.cell(row=row, column=3, value=summary.cash_kurus)
        ws.cell(row=row, column=4, value=summary.card_kurus)
        ws.cell(row=row, column=5, value=summary.total_kurus)
        ws.cell(row=row, column=6, value=summary.z_report_kurus)
        ws.cell(row=row, column=7, value=summary.review_reason or "")
        ws.cell(row=row, column=8, value=str(summary.posted_at or ""))
        cash_total += summary.cash_kurus
        card_total += summary.card_kurus
        total_total += summary.total_kurus
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="TOTAL")
    ws.cell(row=row, column=3, value=cash_total)
    ws.cell(row=row, column=4, value=card_total)
    ws.cell(row=row, column=5, value=total_total)
    bold_row(ws, row, end_col=5)

    autosize_columns(ws)
    return save_workbook_to_bytes(wb)
