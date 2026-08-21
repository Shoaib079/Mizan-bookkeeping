"""Excel export for POS daily sales summaries."""

from __future__ import annotations

from datetime import date

from app.core.dates import format_period
from app.core.excel.workbook import (
    bold_row,
    create_workbook,
    finish_data_table,
    money_header,
    save_workbook_to_bytes,
    write_header_row,
    write_money,
    write_sheet_title,
)
from app.features.pos.schema import PosDailySummaryRead


def build_pos_daily_summaries_xlsx(
    *,
    entity_name: str,
    from_date: date,
    to_date: date,
    review_label: str,
    summaries: list[PosDailySummaryRead],
) -> bytes:
    wb, ws = create_workbook("POS Sales")
    header_row = write_sheet_title(
        ws,
        "POS daily sales",
        subtitles=[
            f"Entity: {entity_name}",
            f"Period: {format_period(from_date, to_date)}",
            f"Filter: {review_label}",
        ],
        end_col=8,
    )

    headers = [
        "Date",
        "Status",
        money_header("Cash"),
        money_header("Card"),
        money_header("Total"),
        money_header("Z report"),
        "Review reason",
        "Posted at",
    ]
    row = write_header_row(ws, header_row, headers)

    cash_total = 0
    card_total = 0
    total_total = 0
    for summary in summaries:
        ws.cell(row=row, column=1, value=str(summary.summary_date or ""))
        ws.cell(row=row, column=2, value=summary.status)
        write_money(ws, row, 3, summary.cash_kurus)
        write_money(ws, row, 4, summary.card_kurus)
        write_money(ws, row, 5, summary.total_kurus)
        write_money(ws, row, 6, summary.z_report_kurus)
        ws.cell(row=row, column=7, value=summary.review_reason or "")
        ws.cell(row=row, column=8, value=str(summary.posted_at or ""))
        cash_total += summary.cash_kurus
        card_total += summary.card_kurus
        total_total += summary.total_kurus
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="TOTAL")
    write_money(ws, row, 3, cash_total)
    write_money(ws, row, 4, card_total)
    write_money(ws, row, 5, total_total)
    bold_row(ws, row, end_col=5)

    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=row,
        end_col=8,
        money_cols=(3, 4, 5, 6),
    )
    return save_workbook_to_bytes(wb)
