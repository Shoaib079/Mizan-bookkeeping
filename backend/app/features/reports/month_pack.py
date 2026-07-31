"""One workbook holding every book for a period — the file you send partners.

Before this, checking a month meant six separate downloads and four books that
had no export at all. A partner asking "where did the money go" had to be sent
a folder, or ask for another file.

Excel rather than PDF on purpose: someone checking figures wants to filter a
column and total it, not scroll a picture of a table.

**A closed month exports its sealed figures.** Two partners downloading the
same month on different days must get the same file, and it must still agree
with whatever was sent when the month was closed — otherwise the pack quietly
contradicts itself and nobody can tell which copy is right. Live months export
live, and the Summary sheet always says which it is.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.core.excel.workbook import (
    add_sheet,
    bold_row,
    create_workbook,
    finish_data_table,
    money_header,
    quantity_header,
    save_workbook_to_bytes,
    write_header_row,
    write_money,
    write_quantity,
    write_sheet_title,
)
from app.core.ledger.subledger_display import SubledgerDisplayKind
from app.core.listing import ListParams
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.dashboard import service as dashboard_service
from app.features.entities import service as entity_service
from app.features.fx import service as fx_service
from app.features.ledger import service as ledger_service
from app.features.pos import service as pos_service
from app.features.reports import cash_book as cash_book_report
from app.features.reports import expense_register as expense_register_report
from app.features.reports import financial_statements
from app.features.reports import time_series as time_series_report
from app.features.reports.excel_export import write_profit_and_loss_sheet
from app.features.staff import service as staff_service

__all__ = ["build_month_pack_xlsx", "month_pack_filename", "MonthPackContext"]

#: How many ledger rows to put in the pack. A restaurant month is well under
#: this; the cap exists so an accidental year-wide range can't produce a file
#: nobody can open.
_LEDGER_ROW_CAP = 20_000


@dataclass
class MonthPackContext:
    entity_id: uuid.UUID
    entity_name: str
    from_date: date
    to_date: date
    #: True when the period is a closed month and figures come from its snapshot.
    sealed: bool
    closed_at: str | None = None


def _money_accounts(session: Session, kind: MoneyAccountKind) -> list[MoneyAccount]:
    from sqlalchemy import select

    return list(
        session.scalars(
            select(MoneyAccount)
            .where(
                MoneyAccount.account_kind == kind,
                MoneyAccount.is_active.is_(True),
            )
            .order_by(MoneyAccount.name)
        )
    )


def _figures_label(ctx: MonthPackContext) -> str:
    if ctx.sealed:
        return f"As closed on {ctx.closed_at}"
    return "Live — month not closed"


def _write_summary(ws, ctx: MonthPackContext, dashboard) -> None:
    # Row 1–3 layout is part of the pack contract (tests + partner familiarity).
    write_sheet_title(
        ws,
        f"{ctx.entity_name} — books for the period",
        subtitles=[],
        end_col=2,
    )
    ws.cell(row=2, column=1, value="Period")
    ws.cell(row=2, column=2, value=f"{ctx.from_date} to {ctx.to_date}")
    ws.cell(row=3, column=1, value="Figures")
    ws.cell(row=3, column=2, value=_figures_label(ctx))

    header_row = 5
    data_start = write_header_row(ws, header_row, ["", money_header()])
    row = data_start
    figures = [
        ("Cash sales", dashboard.sales.cash_sales_kurus),
        ("Card sales", dashboard.sales.pos_card_sales_kurus),
        ("Delivery sales", dashboard.sales.delivery_sales_kurus),
        ("Group / agency sales", dashboard.sales.group_sales_kurus),
        ("Other sales", dashboard.sales.other_sales_kurus),
        ("TOTAL SALES", dashboard.sales.total_sales_kurus),
        ("", None),
        ("Total expenses", dashboard.total_expenses_kurus),
        ("NET RESULT", dashboard.net_result_kurus),
        ("", None),
        ("Cash in hand", dashboard.cash_in_hand_kurus),
        ("Bank balance", dashboard.bank_balance_kurus),
        # FX is not rolled into cash/bank — listed as native holdings below.
        ("Owed to suppliers", dashboard.total_payables_kurus),
        ("Owed by customers", dashboard.total_receivables_kurus),
    ]
    for label, value in figures:
        ws.cell(row=row, column=1, value=label)
        write_money(ws, row, 2, value)
        if label.isupper() and label:
            bold_row(ws, row, end_col=2)
        row += 1

    # Native FX held — the figure partners actually ask for.
    if dashboard.fx_balances:
        row += 1
        ws.cell(row=row, column=1, value="Foreign currency held (native)")
        bold_row(ws, row, end_col=1)
        row += 1
        for fx in dashboard.fx_balances:
            ws.cell(row=row, column=1, value=f"{fx.name} ({fx.currency})")
            write_quantity(ws, row, 2, fx.native_quantity)
            row += 1

    row += 1
    ws.cell(row=row, column=1, value="What's in this file")
    bold_row(ws, row, end_col=1)
    row += 1
    for name in [
        "Sales — day by day",
        "Expenses — every expense in the period",
        "Salaries — accruals, payments and advances",
        "Cash book — each drawer's movements",
        "Bank book — each bank account's movements",
        "Foreign currency — what you hold in each wallet",
        "FX movement books — buys, converts and spends per wallet",
        "Card clearing — sales, deposits and commission",
        "Profit and loss",
        "General ledger — every journal entry",
    ]:
        ws.cell(row=row, column=1, value=name)
        row += 1

    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=row - 1,
        end_col=2,
        autofilter=False,
    )


def _write_sales(ws, series, dashboard, ctx: MonthPackContext) -> None:
    write_sheet_title(
        ws,
        "Sales, day by day",
        subtitles=[f"{ctx.entity_name} · {ctx.from_date} to {ctx.to_date}"],
        end_col=4,
    )
    header_row = 4
    data_start = write_header_row(
        ws,
        header_row,
        ["Date", money_header("Sales"), money_header("Expenses"), money_header("Net")],
    )
    row = data_start
    for point in series.daily:
        ws.cell(row=row, column=1, value=point.date)
        write_money(ws, row, 2, point.sales_kurus)
        write_money(ws, row, 3, point.expenses_kurus)
        write_money(ws, row, 4, point.net_kurus)
        row += 1

    last_daily = row - 1
    row += 1
    ws.cell(row=row, column=1, value="Where the sales came from (whole period)")
    bold_row(ws, row, end_col=1)
    row += 1
    for label, value in [
        ("Cash", dashboard.sales.cash_sales_kurus),
        ("Card", dashboard.sales.pos_card_sales_kurus),
        ("Delivery", dashboard.sales.delivery_sales_kurus),
        ("Group / agency", dashboard.sales.group_sales_kurus),
        ("Other", dashboard.sales.other_sales_kurus),
    ]:
        ws.cell(row=row, column=1, value=label)
        write_money(ws, row, 2, value)
        row += 1
    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(last_daily, data_start),
        end_col=4,
    )


def _write_expenses(ws, register, ctx: MonthPackContext) -> None:
    write_sheet_title(
        ws,
        "Every expense in the period",
        subtitles=[f"{ctx.entity_name} · {ctx.from_date} to {ctx.to_date}"],
        end_col=5,
    )
    header_row = 4
    data_start = write_header_row(
        ws, header_row, ["Date", "Account", "Description", "Recorded as", money_header()]
    )
    row = data_start
    for line in register.rows:
        ws.cell(row=row, column=1, value=line.entry_date)
        ws.cell(row=row, column=2, value=f"{line.account_code} — {line.account_name}")
        ws.cell(row=row, column=3, value=line.description)
        ws.cell(row=row, column=4, value=line.source)
        write_money(ws, row, 5, line.amount_kurus)
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="TOTAL")
    write_money(ws, row, 5, register.total_kurus)
    bold_row(ws, row, end_col=5)
    last_detail = row

    row += 2
    ws.cell(row=row, column=1, value="By category")
    bold_row(ws, row, end_col=1)
    row += 1
    cat_header = row
    row = write_header_row(ws, cat_header, ["Account", "Entries", money_header()])
    for total in register.account_totals:
        ws.cell(row=row, column=1, value=f"{total.account_code} — {total.account_name}")
        ws.cell(row=row, column=2, value=total.entry_count)
        write_money(ws, row, 3, total.amount_kurus)
        row += 1
    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=last_detail,
        end_col=5,
    )


def _write_salaries(
    session: Session,
    ws,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
    ctx: MonthPackContext,
) -> None:
    """Staff movements — TRY and FX amounts must not share a ₺ column."""
    write_sheet_title(
        ws,
        "Staff — accruals, payments and advances",
        subtitles=[
            f"{ctx.entity_name} · {from_date} to {to_date}",
            "FX staff amounts are in their pay currency; TRY cost is the lira booked.",
        ],
        end_col=7,
    )
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
            "Amount",
            money_header("TRY cost"),
        ],
    )
    row = data_start

    employees, _ = staff_service.list_employees(
        session, entity_id, include_inactive=True, list_params=ListParams(limit=500)
    )
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
            ws.cell(row=row, column=1, value=entry.movement_date)
            ws.cell(row=row, column=2, value=employee.name)
            ws.cell(row=row, column=3, value=entry.movement_type.value)
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
    )


def _write_account_book(ws, book, *, heading: str, ctx: MonthPackContext) -> None:
    write_sheet_title(
        ws,
        f"{heading} — {book.money_account_name}",
        subtitles=[f"{ctx.entity_name} · {ctx.from_date} to {ctx.to_date}"],
        end_col=6,
    )
    ws.cell(row=3, column=1, value="Opening")
    write_money(ws, 3, 2, book.opening_kurus)
    ws.cell(row=4, column=1, value="Closing (what should be there)")
    write_money(ws, 4, 2, book.closing_kurus)
    bold_row(ws, 4, end_col=2)

    header_row = 6
    data_start = write_header_row(
        ws,
        header_row,
        [
            "Date",
            "Description",
            "Recorded as",
            money_header("In"),
            money_header("Out"),
            money_header("Balance"),
        ],
    )
    row = data_start
    for line in book.rows:
        ws.cell(row=row, column=1, value=line.entry_date)
        ws.cell(row=row, column=2, value=line.description)
        ws.cell(row=row, column=3, value=line.source)
        write_money(ws, row, 4, line.in_kurus or None)
        write_money(ws, row, 5, line.out_kurus or None)
        write_money(ws, row, 6, line.balance_kurus)
        row += 1
    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(row - 1, data_start),
        end_col=6,
    )


def _write_fx_holdings(ws, fx_balances, ctx: MonthPackContext) -> None:
    """Foreign currency held, by wallet.

    Two different numbers, and conflating them is the usual mistake: the
    quantity is what's actually in the wallet, the TRY cost is what was paid
    for it. The gain or loss between them isn't realised until it's converted,
    so no rate is applied here — that would invent a figure the books don't
    hold.
    """
    write_sheet_title(
        ws,
        "Foreign currency held",
        subtitles=[
            f"{ctx.entity_name} · as of {ctx.to_date}",
            "Amount held is the currency itself; TRY cost is what was paid for it.",
        ],
        end_col=4,
    )

    if not fx_balances:
        ws.cell(row=4, column=1, value="No foreign currency wallets.")
        finish_data_table(
            ws, header_row=4, last_data_row=4, end_col=4, autofilter=False
        )
        return

    header_row = 4
    data_start = write_header_row(
        ws,
        header_row,
        ["Wallet", "Currency", "Amount held", money_header("TRY cost")],
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
    )


def _effective_fx_sums(entries) -> tuple[int, int]:
    native = 0
    try_cost = 0
    for entry in entries:
        kind = getattr(entry, "display_kind", SubledgerDisplayKind.EFFECTIVE)
        if kind != SubledgerDisplayKind.EFFECTIVE and str(kind) != "effective":
            continue
        native += entry.native_quantity
        try_cost += entry.try_cost_kurus
    return native, try_cost


def _write_fx_book(
    session: Session,
    ws,
    *,
    entity_id: uuid.UUID,
    wallet: MoneyAccount,
    from_date: date,
    to_date: date,
    ctx: MonthPackContext,
) -> None:
    currency = wallet.currency or "FX"
    write_sheet_title(
        ws,
        f"FX book — {wallet.name}",
        subtitles=[
            f"{ctx.entity_name} · {from_date} to {to_date} · {currency}",
            "Native quantity and TRY book cost per movement.",
        ],
        end_col=5,
    )

    before_end = from_date - timedelta(days=1)
    opening_entries, _ = fx_service.get_fx_ledger(
        session,
        entity_id,
        wallet.id,
        to_date=before_end,
        list_params=ListParams(limit=_LEDGER_ROW_CAP),
    )
    period_entries, _ = fx_service.get_fx_ledger(
        session,
        entity_id,
        wallet.id,
        from_date=from_date,
        to_date=to_date,
        list_params=ListParams(limit=_LEDGER_ROW_CAP),
    )
    through_to, _ = fx_service.get_fx_ledger(
        session,
        entity_id,
        wallet.id,
        to_date=to_date,
        list_params=ListParams(limit=_LEDGER_ROW_CAP),
    )
    opening_native, opening_try = _effective_fx_sums(opening_entries)
    closing_native, closing_try = _effective_fx_sums(through_to)

    ws.cell(row=3, column=1, value="Opening native")
    write_quantity(ws, 3, 2, opening_native)
    ws.cell(row=3, column=3, value=money_header("Opening TRY cost"))
    write_money(ws, 3, 4, opening_try)
    ws.cell(row=4, column=1, value="Closing native")
    write_quantity(ws, 4, 2, closing_native)
    ws.cell(row=4, column=3, value=money_header("Closing TRY cost"))
    write_money(ws, 4, 4, closing_try)
    bold_row(ws, 4, end_col=4)

    header_row = 6
    data_start = write_header_row(
        ws,
        header_row,
        [
            "Date",
            "Type",
            "Description",
            quantity_header(currency, "Amount"),
            money_header("TRY cost"),
        ],
    )
    row = data_start
    for entry in period_entries:
        kind = getattr(entry, "display_kind", SubledgerDisplayKind.EFFECTIVE)
        if kind != SubledgerDisplayKind.EFFECTIVE and str(kind) != "effective":
            continue
        ws.cell(row=row, column=1, value=entry.movement_date)
        ws.cell(row=row, column=2, value=entry.movement_type.value)
        ws.cell(row=row, column=3, value=entry.description)
        write_quantity(ws, row, 4, entry.native_quantity)
        write_money(ws, row, 5, entry.try_cost_kurus)
        row += 1
    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(row - 1, data_start),
        end_col=5,
    )


def _write_card_clearing(ws, reconciliation, ctx: MonthPackContext) -> None:
    write_sheet_title(
        ws,
        "Card clearing — where card money sat",
        subtitles=[f"{ctx.entity_name} · {ctx.from_date} to {ctx.to_date}"],
        end_col=2,
    )
    header_row = 4
    data_start = write_header_row(ws, header_row, ["", money_header()])
    row = data_start
    for label, value in [
        ("Opening in transit", reconciliation.opening_in_transit_kurus),
        ("Card sales in period", reconciliation.period_card_sales_kurus),
        ("Deposits and clearances", reconciliation.period_clearances_kurus),
        ("Closing in transit", reconciliation.closing_in_transit_kurus),
        ("Commission recorded", reconciliation.commission_recorded_kurus),
        ("Total card sales (all time)", reconciliation.total_card_sales_kurus),
    ]:
        ws.cell(row=row, column=1, value=label)
        write_money(ws, row, 2, value)
        row += 1

    if reconciliation.aging:
        row += 1
        ws.cell(row=row, column=1, value="Undeposited card money by age")
        bold_row(ws, row, end_col=1)
        row += 1
        age_header = row
        row = write_header_row(ws, age_header, ["Age", money_header()])
        for bucket in reconciliation.aging:
            ws.cell(row=row, column=1, value=bucket.label)
            write_money(ws, row, 2, bucket.amount_kurus)
            row += 1
    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(row - 1, data_start),
        end_col=2,
        autofilter=False,
    )


def _write_ledger(ws, entries, account_labels: dict[uuid.UUID, str], ctx: MonthPackContext) -> None:
    """Journal lines carry only an account id, so names are resolved up front
    rather than looked up per row."""
    write_sheet_title(
        ws,
        "General ledger — every entry in the period",
        subtitles=[f"{ctx.entity_name} · {ctx.from_date} to {ctx.to_date}"],
        end_col=7,
    )
    header_row = 4
    data_start = write_header_row(
        ws,
        header_row,
        ["Date", "Description", "Recorded as", "Status", "Account", "Debit", "Credit"],
    )
    row = data_start
    for entry in entries:
        for line in entry.lines:
            ws.cell(row=row, column=1, value=entry.entry_date)
            ws.cell(row=row, column=2, value=entry.description)
            ws.cell(row=row, column=3, value=entry.source.value)
            ws.cell(row=row, column=4, value=entry.status.value)
            ws.cell(
                row=row,
                column=5,
                value=account_labels.get(line.account_id, str(line.account_id)),
            )
            debit = line.side.value.lower() == "debit"
            write_money(ws, row, 6, line.amount_kurus if debit else None)
            write_money(ws, row, 7, None if debit else line.amount_kurus)
            row += 1
    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(row - 1, data_start),
        end_col=7,
    )


def build_month_pack_xlsx(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
) -> tuple[bytes, MonthPackContext]:
    entity = entity_service.get_entity(session, entity_id)
    if entity is None:
        raise LookupError("Entity not found")

    profit_and_loss = financial_statements.get_profit_and_loss(
        session, entity_id, from_date, to_date
    )
    sealed = profit_and_loss.source == financial_statements.VIEW_AS_CLOSED
    ctx = MonthPackContext(
        entity_id=entity_id,
        entity_name=entity.name,
        from_date=from_date,
        to_date=to_date,
        sealed=sealed,
        closed_at=(
            profit_and_loss.sealed.closed_at.date().isoformat()
            if profit_and_loss.sealed is not None
            else None
        ),
    )

    dashboard = dashboard_service.get_dashboard(session, entity_id, from_date, to_date)
    series = time_series_report.get_time_series(session, entity_id, from_date, to_date)
    register = expense_register_report.get_expense_register(
        session, entity_id, from_date, to_date
    )
    clearing = pos_service.get_clearing_reconciliation(
        session, entity_id, from_date=from_date, to_date=to_date
    )
    entries, _ = ledger_service.list_journal_entries(
        session,
        entity_id,
        entry_date_from=from_date,
        entry_date_to=to_date,
        effective_only=True,
        list_params=ListParams(limit=_LEDGER_ROW_CAP),
    )

    from app.db.session import entity_context, require_entity_context

    with entity_context(session, entity_id):
        require_entity_context()
        drawers = _money_accounts(session, MoneyAccountKind.CASH)
        banks = _money_accounts(session, MoneyAccountKind.BANK)
        fx_wallets = _money_accounts(session, MoneyAccountKind.FOREIGN_CURRENCY)
        drawer_ids = [(d.id, d.name) for d in drawers]
        bank_ids = [(b.id, b.name) for b in banks]
        fx_wallet_rows = list(fx_wallets)

        from sqlalchemy import select as _select

        from app.core.chart_of_accounts.models import Account

        account_labels = {
            a.id: f"{a.code} — {a.name_en or a.name_tr}"
            for a in session.scalars(_select(Account))
        }

    wb, summary_ws = create_workbook("Summary")
    _write_summary(summary_ws, ctx, dashboard)
    _write_sales(add_sheet(wb, "Sales"), series, dashboard, ctx)
    _write_expenses(add_sheet(wb, "Expenses"), register, ctx)
    _write_salaries(
        session, add_sheet(wb, "Salaries"), entity_id, from_date, to_date, ctx
    )

    for account_id, name in drawer_ids:
        book = cash_book_report.get_cash_book(
            session, entity_id, account_id, from_date, to_date
        )
        _write_account_book(
            add_sheet(wb, f"Cash — {name}"), book, heading="Cash book", ctx=ctx
        )

    for account_id, name in bank_ids:
        book = cash_book_report.get_cash_book(
            session, entity_id, account_id, from_date, to_date
        )
        _write_account_book(
            add_sheet(wb, f"Bank — {name}"), book, heading="Bank book", ctx=ctx
        )

    _write_fx_holdings(add_sheet(wb, "Foreign currency"), dashboard.fx_balances, ctx)
    for wallet in fx_wallet_rows:
        _write_fx_book(
            session,
            add_sheet(wb, f"FX — {wallet.name}"),
            entity_id=entity_id,
            wallet=wallet,
            from_date=from_date,
            to_date=to_date,
            ctx=ctx,
        )

    _write_card_clearing(add_sheet(wb, "Card clearing"), clearing, ctx)
    write_profit_and_loss_sheet(add_sheet(wb, "Profit and loss"), profit_and_loss)
    _write_ledger(add_sheet(wb, "General ledger"), entries, account_labels, ctx)

    return save_workbook_to_bytes(wb), ctx


def month_pack_filename(ctx: MonthPackContext) -> str:
    suffix = "as-closed" if ctx.sealed else "live"
    return f"books-{ctx.from_date}-to-{ctx.to_date}-{suffix}.xlsx"
