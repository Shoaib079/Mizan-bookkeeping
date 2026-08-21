"""Excel export for delivery sales and settlements activity."""

from __future__ import annotations

import uuid
from datetime import date

from app.core.excel.workbook import (
    bold_row,
    create_workbook,
    finish_data_table,
    money_header,
    save_workbook_to_bytes,
    write_header_row,
    write_money,
)
from app.features.delivery.schema import DeliveryReportRead, DeliverySettlementRead


def build_delivery_activity_xlsx(
    *,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
    platform_label: str,
    sales: list[DeliveryReportRead],
    settlements: list[DeliverySettlementRead],
) -> bytes:
    wb, ws_sales = create_workbook("Sales")
    header_row = _write_header(
        ws_sales,
        title="Delivery sales",
        entity_id=entity_id,
        from_date=from_date,
        to_date=to_date,
        platform_label=platform_label,
    )

    sales_headers = [
        "Platform",
        "Period from",
        "Period to",
        money_header("Gross"),
        "Status",
        "Description",
    ]
    row = write_header_row(ws_sales, header_row, sales_headers)

    sales_total = 0
    for item in sales:
        ws_sales.cell(row=row, column=1, value=item.platform_name)
        ws_sales.cell(row=row, column=2, value=item.period_start.isoformat())
        ws_sales.cell(row=row, column=3, value=item.period_end.isoformat())
        write_money(ws_sales, row, 4, item.gross_kurus)
        ws_sales.cell(row=row, column=5, value=item.status)
        ws_sales.cell(row=row, column=6, value=item.description)
        if item.status == "posted":
            sales_total += item.gross_kurus
        row += 1

    row += 1
    ws_sales.cell(row=row, column=1, value="Posted total")
    write_money(ws_sales, row, 4, sales_total)
    bold_row(ws_sales, row, end_col=4)
    finish_data_table(
        ws_sales,
        header_row=header_row,
        last_data_row=row,
        end_col=6,
        money_cols=(4,),
    )

    ws_settle = wb.create_sheet("Settlements")
    header_row = _write_header(
        ws_settle,
        title="Delivery settlements",
        entity_id=entity_id,
        from_date=from_date,
        to_date=to_date,
        platform_label=platform_label,
    )

    settle_headers = [
        "Platform",
        "Date",
        money_header("Amount"),
        "Description",
    ]
    row = write_header_row(ws_settle, header_row, settle_headers)

    settle_total = 0
    for item in settlements:
        ws_settle.cell(row=row, column=1, value=item.platform_name)
        ws_settle.cell(row=row, column=2, value=item.settlement_date.isoformat())
        write_money(ws_settle, row, 3, item.amount_kurus)
        ws_settle.cell(row=row, column=4, value=item.description)
        settle_total += item.amount_kurus
        row += 1

    row += 1
    ws_settle.cell(row=row, column=1, value="Total")
    write_money(ws_settle, row, 3, settle_total)
    bold_row(ws_settle, row, end_col=3)
    finish_data_table(
        ws_settle,
        header_row=header_row,
        last_data_row=row,
        end_col=4,
        money_cols=(3,),
    )

    return save_workbook_to_bytes(wb)


def _write_header(
    ws,
    *,
    title: str,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
    platform_label: str,
) -> int:
    ws.cell(row=1, column=1, value=title)
    ws.cell(row=2, column=1, value=f"Entity: {entity_id}")
    ws.cell(row=2, column=2, value=f"Period: {from_date} to {to_date}")
    ws.cell(row=3, column=1, value=f"Platform: {platform_label}")
    return 5
