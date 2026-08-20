"""Hand-recorded expenses Excel — same rows as /expenses for the chosen range.

Screen/file rule: header stamps \"Hand-recorded expenses\" + the range; total
footer equals the list total for the same filters. Uses shared Excel helpers.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.dates import format_period
from app.core.excel.workbook import (
    create_workbook,
    finish_data_table,
    money_header,
    save_workbook_to_bytes,
    write_date,
    write_header_row,
    write_money,
    write_sheet_title,
)
from app.core.listing import ListParams, MAX_LIST_LIMIT
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount
from app.features.entities import service as entity_service
from app.features.expenses import service as expenses_service
from app.features.expenses.models import ExpenseEntryStatus, ExpenseItem
from app.features.expenses.schema import ExpenseRead
from app.features.reports.excel_export import export_filename

__all__ = [
    "build_hand_recorded_expenses_xlsx",
    "hand_recorded_expenses_filename",
]


def hand_recorded_expenses_filename(
    *,
    entity_name: str | None,
    from_date: date,
    to_date: date,
) -> str:
    return export_filename(
        "hand-recorded-expenses",
        entity_name=entity_name,
        from_date=from_date,
        to_date=to_date,
    )


def _fetch_all_expenses(
    session: Session,
    entity_id: uuid.UUID,
    *,
    from_date: date,
    to_date: date,
    status: ExpenseEntryStatus | None,
    q: str | None,
    expense_item_id: uuid.UUID | None,
) -> tuple[list[ExpenseRead], int]:
    items: list[ExpenseRead] = []
    offset = 0
    total_amount = 0
    while True:
        batch, total, total_amount_kurus = expenses_service.list_expenses(
            session,
            entity_id,
            status=status,
            from_date=from_date,
            to_date=to_date,
            q=q,
            expense_item_id=expense_item_id,
            list_params=ListParams(limit=MAX_LIST_LIMIT, offset=offset),
        )
        items.extend(batch)
        total_amount = total_amount_kurus
        offset += len(batch)
        if offset >= total or not batch:
            break
    return items, total_amount


def build_hand_recorded_expenses_xlsx(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
    *,
    status: ExpenseEntryStatus | None = None,
    q: str | None = None,
    expense_item_id: uuid.UUID | None = None,
) -> tuple[bytes, str, int]:
    entity = entity_service.get_entity(session, entity_id)
    if entity is None:
        raise LookupError("Entity not found")
    if to_date < from_date:
        raise ValueError("to must not be before from")

    expenses, total_amount_kurus = _fetch_all_expenses(
        session,
        entity_id,
        from_date=from_date,
        to_date=to_date,
        status=status,
        q=q,
        expense_item_id=expense_item_id,
    )

    with entity_context(session, entity_id):
        require_entity_context()
        account_ids = {e.expense_account_id for e in expenses}
        money_ids = {e.money_account_id for e in expenses}
        item_ids = {e.expense_item_id for e in expenses if e.expense_item_id}
        accounts = {
            a.id: f"{a.code} — {a.name_en or a.name_tr}"
            for a in session.scalars(
                select(Account).where(Account.id.in_(account_ids))
            )
        } if account_ids else {}
        money_names = {
            m.id: m.name
            for m in session.scalars(
                select(MoneyAccount).where(MoneyAccount.id.in_(money_ids))
            )
        } if money_ids else {}
        item_names = {
            i.id: i.canonical_name
            for i in session.scalars(
                select(ExpenseItem).where(ExpenseItem.id.in_(item_ids))
            )
        } if item_ids else {}

    range_label = format_period(from_date, to_date)
    wb, ws = create_workbook("Expenses")
    write_sheet_title(
        ws,
        "Hand-recorded expenses",
        subtitles=[f"{entity.name} · {range_label}"],
        end_col=6,
    )
    header_row = 4
    data_start = write_header_row(
        ws,
        header_row,
        [
            "Date",
            "Item",
            "Account",
            "Paid from",
            "Note",
            money_header("Amount"),
        ],
    )
    row = data_start
    for expense in expenses:
        item_label = (
            item_names.get(expense.expense_item_id)
            if expense.expense_item_id
            else None
        ) or expense.written_item_description or expense.description
        write_date(ws, row, 1, expense.expense_date)
        ws.cell(row=row, column=2, value=item_label)
        ws.cell(
            row=row,
            column=3,
            value=accounts.get(expense.expense_account_id, str(expense.expense_account_id)),
        )
        ws.cell(
            row=row,
            column=4,
            value=money_names.get(expense.money_account_id, str(expense.money_account_id)),
        )
        ws.cell(row=row, column=5, value=expense.notes or "")
        write_money(ws, row, 6, expense.amount_kurus)
        row += 1

    # Total footer — same figure as the /expenses page total for this range.
    ws.cell(row=row, column=5, value="Total")
    write_money(ws, row, 6, total_amount_kurus)
    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(row - 1, data_start),
        end_col=6,
        money_cols=(6,),
    )

    filename = hand_recorded_expenses_filename(
        entity_name=entity.name,
        from_date=from_date,
        to_date=to_date,
    )
    return save_workbook_to_bytes(wb), filename, total_amount_kurus
