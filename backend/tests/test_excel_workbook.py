"""Shared Excel workbook helpers — titles, headers, money format."""

from __future__ import annotations

from openpyxl import Workbook

from app.core.excel.workbook import (
    MONEY_FORMAT,
    add_sheet,
    create_workbook,
    finish_data_table,
    money_header,
    quantity_header,
    unique_sheet_title,
    write_header_row,
    write_money,
    write_sheet_title,
)


def test_unique_sheet_title_caps_length_and_avoids_collisions():
    wb = Workbook()
    wb.active.title = "Cash — Short"
    long = "Cash — " + ("VeryLongTurkishRestaurantAccountName" * 3)
    first = unique_sheet_title(wb, long)
    assert len(first) <= 31
    wb.create_sheet(title=first)
    second = unique_sheet_title(wb, long)
    assert second != first
    assert len(second) <= 31
    assert second.endswith("(2)") or " (2)" in second


def test_add_sheet_never_duplicates_titles():
    wb, _ = create_workbook("Bank — Garanti")
    a = add_sheet(wb, "Bank — Garanti")
    b = add_sheet(wb, "Bank — Garanti")
    assert a.title != b.title
    assert len(a.title) <= 31
    assert len(b.title) <= 31


def test_quantity_header_puts_currency_in_the_label():
    assert quantity_header("USD") == "Amount held (USD)"
    assert money_header() == "Amount (₺)"


def test_finish_data_table_freezes_and_filters():
    wb, ws = create_workbook("Demo")
    write_sheet_title(ws, "Demo report", subtitles=["Period: June"], end_col=2)
    header_row = 4
    data_start = write_header_row(ws, header_row, ["Label", money_header()])
    write_money(ws, data_start, 2, 12_345)
    ws.cell(row=data_start, column=1, value="Sample")
    finish_data_table(
        ws, header_row=header_row, last_data_row=data_start, end_col=2
    )
    assert ws.freeze_panes == "A5"
    assert ws.auto_filter.ref is not None
    assert ws.cell(row=data_start, column=2).number_format == MONEY_FORMAT
