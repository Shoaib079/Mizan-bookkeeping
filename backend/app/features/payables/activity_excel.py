"""Excel export for supplier activity timeline."""

from __future__ import annotations

from app.core.excel.workbook import (
    create_workbook,
    finish_data_table,
    money_header,
    save_workbook_to_bytes,
    write_header_row,
    write_money,
)
from app.features.payables.schema import SupplierActivityRead


def build_supplier_activity_xlsx(report: SupplierActivityRead) -> bytes:
    wb, ws = create_workbook("Hareketler")
    ws.cell(row=1, column=1, value=report.supplier_name)
    ws.cell(row=2, column=1, value=f"VKN {report.supplier_vkn}")
    ws.cell(
        row=3,
        column=1,
        value=f"Period: {report.from_date} – {report.to_date}",
    )
    ws.cell(row=4, column=1, value="Opening balance")
    write_money(ws, 4, 2, report.opening_balance_kurus)
    ws.cell(row=5, column=1, value="Closing balance")
    write_money(ws, 5, 2, report.closing_balance_kurus)

    header_row = 7
    amount_label = money_header()
    headers = [
        "Date",
        "Movement",
        "Document / ref",
        "Detail",
        money_header("Net"),
        money_header("VAT"),
        amount_label,
        "Bank",
        "Receipt",
        money_header("Balance"),
    ]
    row = write_header_row(ws, header_row, headers)

    for item in report.rows:
        ws.cell(row=row, column=1, value=str(item.movement_date))
        ws.cell(row=row, column=2, value=item.movement_label)
        ws.cell(row=row, column=3, value=item.document_ref)
        ws.cell(row=row, column=4, value=item.detail)
        write_money(ws, row, 5, item.net_kurus)
        write_money(ws, row, 6, item.vat_kurus)
        write_money(ws, row, 7, item.amount_kurus)
        if item.bank_name:
            ws.cell(row=row, column=8, value=item.bank_name)
        if item.dekont_ref:
            ws.cell(row=row, column=9, value=item.dekont_ref)
        write_money(ws, row, 10, item.balance_kurus)
        row += 1

    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(row - 1, header_row),
        end_col=10,
        money_cols=(5, 6, 7, 10),
    )
    return save_workbook_to_bytes(wb)
