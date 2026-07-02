"""Excel export for delivery sales and settlements activity."""

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
    row = _write_header(
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
        "Gross",
        "Status",
        "Description",
    ]
    for col, header in enumerate(sales_headers, start=1):
        ws_sales.cell(row=row, column=col, value=header)
    bold_row(ws_sales, row, end_col=len(sales_headers))
    row += 1

    sales_total = 0
    for item in sales:
        ws_sales.cell(row=row, column=1, value=item.platform_name)
        ws_sales.cell(row=row, column=2, value=item.period_start.isoformat())
        ws_sales.cell(row=row, column=3, value=item.period_end.isoformat())
        ws_sales.cell(row=row, column=4, value=item.gross_kurus)
        ws_sales.cell(row=row, column=5, value=item.status)
        ws_sales.cell(row=row, column=6, value=item.description)
        if item.status == "posted":
            sales_total += item.gross_kurus
        row += 1

    row += 1
    ws_sales.cell(row=row, column=1, value="Posted total")
    ws_sales.cell(row=row, column=4, value=sales_total)
    bold_row(ws_sales, row, end_col=4)
    autosize_columns(ws_sales)

    ws_settle = wb.create_sheet("Settlements")
    row = _write_header(
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
        format_kurus_label("Amount"),
        "Description",
    ]
    for col, header in enumerate(settle_headers, start=1):
        ws_settle.cell(row=row, column=col, value=header)
    bold_row(ws_settle, row, end_col=len(settle_headers))
    row += 1

    settle_total = 0
    for item in settlements:
        ws_settle.cell(row=row, column=1, value=item.platform_name)
        ws_settle.cell(row=row, column=2, value=item.settlement_date.isoformat())
        ws_settle.cell(row=row, column=3, value=item.amount_kurus)
        ws_settle.cell(row=row, column=4, value=item.description)
        settle_total += item.amount_kurus
        row += 1

    row += 1
    ws_settle.cell(row=row, column=1, value="Total")
    ws_settle.cell(row=row, column=3, value=settle_total)
    bold_row(ws_settle, row, end_col=3)
    autosize_columns(ws_settle)

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
