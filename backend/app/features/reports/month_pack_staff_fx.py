"""Month-pack Salaries and Foreign-currency sheets (S14 headers).

Kept out of ``month_pack.py`` so that file stays under the size ratchet while
amount / quantity headers use the shared ``money_header`` / ``quantity_header``.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date

from sqlalchemy.orm import Session

from app.core.dates import format_as_of, format_period
from app.core.excel.labels import format_staff_movement
from app.core.excel.workbook import (
    bold_row,
    finish_data_table,
    fit_columns_from_content,
    money_header,
    quantity_header,
    write_date,
    write_header_row,
    write_money,
    write_quantity,
    write_sheet_title,
)
from app.core.ledger.subledger_display import SubledgerDisplayKind
from app.core.listing import ListParams
from app.features.staff import service as staff_service


def write_salaries(
    session: Session,
    ws,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
    *,
    entity_name: str,
    print_footer: str,
) -> None:
    """Staff movements — TRY and FX amounts must not share a ₺ column."""
    write_sheet_title(
        ws,
        "Staff — accruals, payments and advances",
        subtitles=[
            f"{entity_name} · {format_period(from_date, to_date)}",
            "FX staff amounts are in their pay currency; TRY cost is the lira booked.",
        ],
        end_col=7,
    )
    employees, _ = staff_service.list_employees(
        session, entity_id, include_inactive=True, list_params=ListParams(limit=500)
    )
    pay_currencies: set[str] = set()
    for employee in employees:
        raw = employee.pay_currency
        pay_currencies.add(raw.value if hasattr(raw, "value") else str(raw))
    if pay_currencies == {"TRY"}:
        amount_hdr = money_header()
    elif len(pay_currencies) == 1:
        amount_hdr = quantity_header(next(iter(pay_currencies)), "Amount")
    else:
        amount_hdr = "Amount"

    header_row = 5
    data_start = write_header_row(
        ws,
        header_row,
        [
            "Date",
            "Employee",
            "Movement",
            "Description",
            "Currency",
            amount_hdr,
            money_header("TRY cost"),
        ],
    )
    row = data_start

    for employee in employees:
        ledger = staff_service.get_staff_ledger(session, entity_id, employee.id)
        raw_currency = employee.pay_currency
        currency = (
            raw_currency.value if hasattr(raw_currency, "value") else str(raw_currency)
        )
        for entry in ledger.entries:
            if not (from_date <= entry.movement_date <= to_date):
                continue
            if entry.display_kind != SubledgerDisplayKind.EFFECTIVE:
                continue
            write_date(ws, row, 1, entry.movement_date)
            ws.cell(row=row, column=2, value=employee.name)
            ws.cell(row=row, column=3, value=format_staff_movement(entry.movement_type))
            ws.cell(row=row, column=4, value=entry.description)
            ws.cell(row=row, column=5, value=currency)
            if currency == "TRY":
                write_money(ws, row, 6, entry.amount_minor)
            else:
                write_quantity(ws, row, 6, entry.amount_minor)
                if entry.try_cost_kurus is not None:
                    write_money(ws, row, 7, entry.try_cost_kurus)
            row += 1
    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(row - 1, data_start),
        end_col=7,
        money_cols=(6, 7),
        print_footer=print_footer,
    )
    fit_columns_from_content(
        ws,
        first_row=header_row,
        last_row=max(row - 1, data_start),
        last_col=7,
        min_widths={1: 12, 2: 20, 3: 18, 4: 28, 5: 10, 6: 14, 7: 14},
        max_widths={1: 14, 2: 32, 3: 24, 4: 70, 5: 12, 6: 16, 7: 16},
        wrap_cols=(4,),
    )


def write_fx_holdings(ws, fx_balances, *, entity_name: str, as_of, print_footer: str) -> None:
    """Foreign currency held, by wallet."""
    write_sheet_title(
        ws,
        "Foreign currency held",
        subtitles=[
            f"{entity_name} · {format_as_of(as_of)}",
            "Amount held is the currency itself; TRY cost is what was paid for it.",
        ],
        end_col=4,
    )

    if not fx_balances:
        ws.cell(row=4, column=1, value="No foreign currency wallets.")
        finish_data_table(
            ws,
            header_row=4,
            last_data_row=4,
            end_col=4,
            autofilter=False,
            print_footer=print_footer,
        )
        return

    currencies = {fx.currency for fx in fx_balances}
    held_hdr = (
        quantity_header(next(iter(currencies)))
        if len(currencies) == 1
        else "Amount held"
    )
    header_row = 4
    data_start = write_header_row(
        ws,
        header_row,
        ["Wallet", "Currency", held_hdr, money_header("TRY cost")],
    )
    row = data_start
    by_currency: dict[str, int] = defaultdict(int)
    for fx in fx_balances:
        ws.cell(row=row, column=1, value=fx.name)
        ws.cell(row=row, column=2, value=fx.currency)
        write_quantity(ws, row, 3, fx.native_quantity)
        write_money(ws, row, 4, fx.try_cost_kurus)
        by_currency[fx.currency] += fx.native_quantity
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="By currency (native)")
    bold_row(ws, row, end_col=1)
    row += 1
    for currency, native in sorted(by_currency.items()):
        ws.cell(row=row, column=1, value=quantity_header(currency, "Total held"))
        write_quantity(ws, row, 3, native)
        row += 1

    ws.cell(row=row, column=1, value="TOTAL TRY COST")
    write_money(ws, row, 4, sum(fx.try_cost_kurus for fx in fx_balances))
    bold_row(ws, row, end_col=4)

    row += 2
    ws.cell(
        row=row,
        column=1,
        value=(
            "Any gain or loss between amount held and TRY cost is realised "
            "only on conversion — this file does not invent a market rate."
        ),
    )
    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=data_start + len(fx_balances) - 1,
        end_col=4,
        money_cols=(3, 4),
        print_footer=print_footer,
    )
    fit_columns_from_content(
        ws,
        first_row=header_row,
        last_row=row,
        last_col=4,
        min_widths={1: 18, 2: 10, 3: 14, 4: 14},
        max_widths={1: 40, 2: 12, 3: 18, 4: 18},
        wrap_cols=(1,),
    )
