"""Standalone Cash & bank book Excel — one sheet per active cash/bank account.

Reuses the month-pack account-book sheet writer so standalone and pack stay one
shape. Filename is fixed by the owner prompt (mizan- prefix + live/as-closed).
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.core.excel.workbook import add_sheet, create_workbook, save_workbook_to_bytes
from app.features.banking.models import MoneyAccountKind
from app.features.entities import service as entity_service
from app.features.reports import cash_book as cash_book_report
from app.features.reports import financial_statements
from app.features.reports.excel_export import period_segment
from app.features.reports.month_pack import (
    MonthPackContext,
    _money_accounts,
    _write_account_book,
)
from app.features.reports.service import InvalidDateRangeError
from app.db.session import entity_context, require_entity_context

__all__ = [
    "build_cash_bank_book_xlsx",
    "cash_bank_book_filename",
]


def cash_bank_book_filename(
    from_date: date,
    to_date: date,
    *,
    sealed: bool,
) -> str:
    suffix = "as-closed" if sealed else "live"
    return (
        f"mizan-cash-bank-book-{period_segment(from_date, to_date)}-{suffix}.xlsx"
    )


def build_cash_bank_book_xlsx(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
) -> tuple[bytes, str]:
    entity = entity_service.get_entity(session, entity_id)
    if entity is None:
        raise LookupError("Entity not found")
    if to_date < from_date:
        raise InvalidDateRangeError("to_date must not be before from_date")

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

    with entity_context(session, entity_id):
        require_entity_context()
        drawers = _money_accounts(session, MoneyAccountKind.CASH)
        banks = _money_accounts(session, MoneyAccountKind.BANK)

    accounts: list[tuple[uuid.UUID, str, str]] = [
        *((d.id, d.name, "Cash") for d in drawers),
        *((b.id, b.name, "Bank") for b in banks),
    ]
    if not accounts:
        raise LookupError("No active cash or bank accounts")

    first_id, first_name, first_kind = accounts[0]
    first_book = cash_book_report.get_cash_book(
        session, entity_id, first_id, from_date, to_date
    )
    wb, first_ws = create_workbook(f"{first_kind} — {first_name}")
    _write_account_book(
        first_ws,
        first_book,
        heading=f"{first_kind} book",
        ctx=ctx,
    )

    for account_id, name, kind in accounts[1:]:
        book = cash_book_report.get_cash_book(
            session, entity_id, account_id, from_date, to_date
        )
        _write_account_book(
            add_sheet(wb, f"{kind} — {name}"),
            book,
            heading=f"{kind} book",
            ctx=ctx,
        )

    return save_workbook_to_bytes(wb), cash_bank_book_filename(
        from_date, to_date, sealed=sealed
    )
