"""Excel export for supplier activity timeline."""

from __future__ import annotations

from app.core.excel.workbook import (
    autosize_columns,
    bold_row,
    create_workbook,
    format_kurus_label,
    save_workbook_to_bytes,
)
from app.features.payables.schema import SupplierActivityRead


def build_supplier_activity_xlsx(report: SupplierActivityRead) -> bytes:
    wb, ws = create_workbook("Hareketler")
    ws.cell(row=1, column=1, value=report.supplier_name)
    ws.cell(row=2, column=1, value=f"VKN {report.supplier_vkn}")
    ws.cell(
        row=3,
        column=1,
        value=f"Dönem: {report.from_date} – {report.to_date}",
    )
    ws.cell(row=4, column=1, value="Açılış bakiyesi")
    ws.cell(row=4, column=2, value=report.opening_balance_kurus)
    ws.cell(row=5, column=1, value="Kapanış bakiyesi")
    ws.cell(row=5, column=2, value=report.closing_balance_kurus)

    header_row = 7
    amount_label = format_kurus_label()
    headers = [
        "Tarih",
        "Hareket",
        "Belge / ref",
        "Açıklama",
        "Matrah",
        "KDV",
        amount_label,
        "Banka",
        "Dekont",
        "Bakiye",
    ]
    for col, header in enumerate(headers, start=1):
        ws.cell(row=header_row, column=col, value=header)
    bold_row(ws, header_row, end_col=len(headers))

    row = header_row + 1
    for item in report.rows:
        ws.cell(row=row, column=1, value=str(item.movement_date))
        ws.cell(row=row, column=2, value=item.movement_label)
        ws.cell(row=row, column=3, value=item.document_ref)
        ws.cell(row=row, column=4, value=item.detail)
        if item.net_kurus is not None:
            ws.cell(row=row, column=5, value=item.net_kurus)
        if item.vat_kurus is not None:
            ws.cell(row=row, column=6, value=item.vat_kurus)
        if item.amount_kurus is not None:
            ws.cell(row=row, column=7, value=item.amount_kurus)
        if item.bank_name:
            ws.cell(row=row, column=8, value=item.bank_name)
        if item.dekont_ref:
            ws.cell(row=row, column=9, value=item.dekont_ref)
        ws.cell(row=row, column=10, value=item.balance_kurus)
        row += 1

    autosize_columns(ws)
    return save_workbook_to_bytes(wb)
