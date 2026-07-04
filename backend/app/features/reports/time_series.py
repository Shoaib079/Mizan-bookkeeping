"""Daily time-series aggregation — sales, expenses, net, by account (DASH-B).

Also provides per-expense-item totals for SRCH-B foundation.
"""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import (
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
)
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.expenses.models import ExpenseEntry, ExpenseItem
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus
from app.features.suppliers.models import Supplier


class DailyPoint(BaseModel):
    date: date
    sales_kurus: int
    expenses_kurus: int
    net_kurus: int


class ExpenseByAccount(BaseModel):
    account_id: str
    account_code: str
    account_name: str
    total_kurus: int


class ExpenseByItem(BaseModel):
    expense_item_id: str
    canonical_name: str
    total_kurus: int


class SpendBySupplier(BaseModel):
    supplier_id: str
    supplier_name: str
    total_kurus: int


class TimeSeriesRead(BaseModel):
    entity_id: str
    from_date: date
    to_date: date
    daily: list[DailyPoint]
    expenses_by_account: list[ExpenseByAccount]
    expenses_by_item: list[ExpenseByItem]
    spend_by_supplier: list[SpendBySupplier]


def get_time_series(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
) -> TimeSeriesRead:
    if from_date > to_date:
        raise ValueError("from_date must be on or before to_date")

    entity = entity_service.get_entity(session, entity_id)
    if entity is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        sales_account_id = _sales_revenue_account_id(session)

        daily_sales = _daily_sales(session, sales_account_id, from_date, to_date)
        daily_expenses = _daily_expenses(session, from_date, to_date)
        daily = _merge_daily(daily_sales, daily_expenses, from_date, to_date)

        by_account = _expenses_by_account(session, from_date, to_date)
        by_item = _expenses_by_item(session, from_date, to_date)
        by_supplier = _spend_by_supplier(session, from_date, to_date)

    return TimeSeriesRead(
        entity_id=str(entity_id),
        from_date=from_date,
        to_date=to_date,
        daily=daily,
        expenses_by_account=by_account,
        expenses_by_item=by_item,
        spend_by_supplier=by_supplier,
    )


def _sales_revenue_account_id(session: Session) -> uuid.UUID:
    row = session.execute(
        select(Account.id).where(Account.code == SALES_REVENUE_CODE)
    ).first()
    if not row:
        raise LookupError(f"Sales revenue account {SALES_REVENUE_CODE} not found")
    return row[0]


def _daily_sales(
    session: Session,
    sales_account_id: uuid.UUID,
    from_date: date,
    to_date: date,
) -> dict[date, int]:
    rows = session.execute(
        select(
            JournalEntry.entry_date,
            func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0),
        )
        .join(JournalEntryLine, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .where(
            JournalEntry.status == JournalEntryStatus.POSTED.value,
            JournalEntry.entry_date >= from_date,
            JournalEntry.entry_date <= to_date,
            JournalEntryLine.account_id == sales_account_id,
            JournalEntryLine.side == AccountNormalBalance.CREDIT,
        )
        .group_by(JournalEntry.entry_date)
    ).all()
    return {d: int(total) for d, total in rows}


def _daily_expenses(
    session: Session,
    from_date: date,
    to_date: date,
) -> dict[date, int]:
    rows = session.execute(
        select(
            JournalEntry.entry_date,
            func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0),
        )
        .select_from(JournalEntryLine)
        .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
        .join(Account, Account.id == JournalEntryLine.account_id)
        .where(
            JournalEntry.status == JournalEntryStatus.POSTED.value,
            JournalEntry.entry_date >= from_date,
            JournalEntry.entry_date <= to_date,
            Account.account_type == AccountType.EXPENSE,
            JournalEntryLine.side == AccountNormalBalance.DEBIT,
        )
        .group_by(JournalEntry.entry_date)
    ).all()
    return {d: int(total) for d, total in rows}


def _merge_daily(
    sales: dict[date, int],
    expenses: dict[date, int],
    from_date: date,
    to_date: date,
) -> list[DailyPoint]:
    all_dates = sorted(set(sales.keys()) | set(expenses.keys()))
    return [
        DailyPoint(
            date=d,
            sales_kurus=sales.get(d, 0),
            expenses_kurus=expenses.get(d, 0),
            net_kurus=sales.get(d, 0) - expenses.get(d, 0),
        )
        for d in all_dates
        if from_date <= d <= to_date
    ]


def _expenses_by_account(
    session: Session,
    from_date: date,
    to_date: date,
) -> list[ExpenseByAccount]:
    rows = session.execute(
        select(
            Account.id,
            Account.code,
            Account.name_en,
            func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0),
        )
        .select_from(JournalEntryLine)
        .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
        .join(Account, Account.id == JournalEntryLine.account_id)
        .where(
            JournalEntry.status == JournalEntryStatus.POSTED.value,
            JournalEntry.entry_date >= from_date,
            JournalEntry.entry_date <= to_date,
            Account.account_type == AccountType.EXPENSE,
            JournalEntryLine.side == AccountNormalBalance.DEBIT,
        )
        .group_by(Account.id, Account.code, Account.name_en)
        .order_by(func.sum(JournalEntryLine.amount_kurus).desc())
    ).all()
    return [
        ExpenseByAccount(
            account_id=str(aid),
            account_code=code,
            account_name=name,
            total_kurus=int(total),
        )
        for aid, code, name, total in rows
        if int(total) != 0
    ]


def _expenses_by_item(
    session: Session,
    from_date: date,
    to_date: date,
) -> list[ExpenseByItem]:
    rows = session.execute(
        select(
            ExpenseItem.id,
            ExpenseItem.canonical_name,
            func.coalesce(func.sum(ExpenseEntry.amount_kurus), 0),
        )
        .select_from(ExpenseEntry)
        .join(ExpenseItem, ExpenseItem.id == ExpenseEntry.expense_item_id)
        .where(
            ExpenseEntry.status == "posted",
            ExpenseEntry.expense_date >= from_date,
            ExpenseEntry.expense_date <= to_date,
        )
        .group_by(ExpenseItem.id, ExpenseItem.canonical_name)
        .order_by(func.sum(ExpenseEntry.amount_kurus).desc())
    ).all()
    return [
        ExpenseByItem(
            expense_item_id=str(eid),
            canonical_name=name,
            total_kurus=int(total),
        )
        for eid, name, total in rows
        if int(total) != 0
    ]


def _spend_by_supplier(
    session: Session,
    from_date: date,
    to_date: date,
) -> list[SpendBySupplier]:
    """Posted invoice gross totals grouped by supplier for the period."""
    rows = session.execute(
        select(
            Supplier.id,
            Supplier.name,
            func.coalesce(func.sum(InvoiceDraft.gross_kurus), 0),
        )
        .select_from(InvoiceDraft)
        .join(Supplier, Supplier.id == InvoiceDraft.supplier_id)
        .where(
            InvoiceDraft.status == InvoiceDraftStatus.POSTED.value,
            InvoiceDraft.invoice_date >= from_date,
            InvoiceDraft.invoice_date <= to_date,
        )
        .group_by(Supplier.id, Supplier.name)
        .order_by(func.sum(InvoiceDraft.gross_kurus).desc())
    ).all()
    return [
        SpendBySupplier(
            supplier_id=str(sid),
            supplier_name=name,
            total_kurus=int(total),
        )
        for sid, name, total in rows
        if int(total) != 0
    ]
