"""Warn before recording the same amount for the same kind on the same date."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntry, JournalEntryStatus
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables.types import CustomerMovementType
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.types import StaffMovementType
from app.features.expenses.models import ExpenseEntry, ExpenseEntryStatus, ExpenseItem
from app.features.group_sales.models import GroupSale, GroupSaleStatus


@dataclass(frozen=True, slots=True)
class DuplicateMatch:
    record_kind: str
    message: str
    existing_id: uuid.UUID | None = None


class DuplicateRecordError(Exception):
    """Caller should return HTTP 409 unless the user acknowledged the duplicate."""

    def __init__(self, match: DuplicateMatch) -> None:
        self.match = match
        super().__init__(match.message)


def duplicate_http_detail(match: DuplicateMatch) -> dict[str, str | None]:
    return {
        "code": "duplicate_record",
        "message": match.message,
        "record_kind": match.record_kind,
        "existing_id": str(match.existing_id) if match.existing_id else None,
    }


def ensure_not_duplicate(match: DuplicateMatch | None, *, acknowledged: bool) -> None:
    if match is not None and not acknowledged:
        raise DuplicateRecordError(match)


def _format_tr_date(value: date) -> str:
    return f"{value.day:02d}.{value.month:02d}.{value.year}"


def _format_try(kurus: int) -> str:
    whole = kurus // 100
    frac = abs(kurus) % 100
    return f"₺{whole:,}.{frac:02d}".replace(",", ".")


def _live_journal_filter(journal_entry_id_col):
    return or_(
        journal_entry_id_col.is_(None),
        JournalEntry.status == JournalEntryStatus.POSTED,
    )


def find_duplicate_expense(
    session: Session,
    *,
    expense_date: date,
    amount_kurus: int,
    expense_account_id: uuid.UUID,
    expense_item_id: uuid.UUID | None = None,
) -> DuplicateMatch | None:
    filters = [
        ExpenseEntry.expense_date == expense_date,
        ExpenseEntry.amount_kurus == amount_kurus,
        ExpenseEntry.expense_account_id == expense_account_id,
        ExpenseEntry.status == ExpenseEntryStatus.POSTED,
        _live_journal_filter(ExpenseEntry.journal_entry_id),
    ]
    if expense_item_id is not None:
        filters.append(ExpenseEntry.expense_item_id == expense_item_id)
    else:
        filters.append(ExpenseEntry.expense_item_id.is_(None))

    row_id = session.scalar(
        select(ExpenseEntry.id)
        .outerjoin(JournalEntry, ExpenseEntry.journal_entry_id == JournalEntry.id)
        .where(*filters)
        .limit(1)
    )
    if row_id is None:
        return None

    if expense_item_id is not None:
        item_name = session.scalar(
            select(ExpenseItem.canonical_name).where(ExpenseItem.id == expense_item_id)
        )
        item_clause = f" for {item_name}" if item_name else " for this item"
    else:
        item_clause = ""

    return DuplicateMatch(
        record_kind="expense",
        existing_id=row_id,
        message=(
            f"An expense for {_format_try(amount_kurus)} on {_format_tr_date(expense_date)}"
            f"{item_clause} in this category already exists."
        ),
    )


def find_duplicate_partner_expense_fronted(
    session: Session,
    *,
    partner_id: uuid.UUID,
    expense_date: date,
    amount_kurus: int,
    expense_account_id: uuid.UUID,
) -> DuplicateMatch | None:
    del expense_account_id  # partner ledger has no expense account — date+amount+partner
    row_id = session.scalar(
        select(PartnerLedgerEntry.id)
        .outerjoin(JournalEntry, PartnerLedgerEntry.journal_entry_id == JournalEntry.id)
        .where(
            PartnerLedgerEntry.partner_id == partner_id,
            PartnerLedgerEntry.movement_date == expense_date,
            PartnerLedgerEntry.movement_type == PartnerMovementType.EXPENSE_FRONTED,
            PartnerLedgerEntry.amount_kurus == amount_kurus,
            _live_journal_filter(PartnerLedgerEntry.journal_entry_id),
        )
        .limit(1)
    )
    if row_id is None:
        return None
    return DuplicateMatch(
        record_kind="partner_expense",
        existing_id=row_id,
        message=(
            f"A partner-fronted expense for {_format_try(amount_kurus)} on "
            f"{_format_tr_date(expense_date)} already exists."
        ),
    )


def find_duplicate_credit_sale(
    session: Session,
    *,
    customer_id: uuid.UUID,
    sale_date: date,
    amount_kurus: int,
) -> DuplicateMatch | None:
    row_id = session.scalar(
        select(CustomerLedgerEntry.id)
        .outerjoin(JournalEntry, CustomerLedgerEntry.journal_entry_id == JournalEntry.id)
        .where(
            CustomerLedgerEntry.customer_id == customer_id,
            CustomerLedgerEntry.movement_date == sale_date,
            CustomerLedgerEntry.movement_type == CustomerMovementType.CREDIT_SALE,
            CustomerLedgerEntry.amount_kurus == amount_kurus,
            _live_journal_filter(CustomerLedgerEntry.journal_entry_id),
        )
        .limit(1)
    )
    if row_id is not None:
        return DuplicateMatch(
            record_kind="sale",
            existing_id=row_id,
            message=(
                f"A credit sale for {_format_try(amount_kurus)} on "
                f"{_format_tr_date(sale_date)} already exists for this customer."
            ),
        )

    group_id = session.scalar(
        select(GroupSale.id).where(
            GroupSale.customer_id == customer_id,
            GroupSale.sale_date == sale_date,
            GroupSale.total_kurus == amount_kurus,
            GroupSale.status == GroupSaleStatus.POSTED.value,
        ).limit(1)
    )
    if group_id is None:
        return None
    return DuplicateMatch(
        record_kind="sale",
        existing_id=group_id,
        message=(
            f"A group sale for {_format_try(amount_kurus)} on "
            f"{_format_tr_date(sale_date)} already exists for this customer."
        ),
    )


def find_duplicate_staff_movement(
    session: Session,
    *,
    employee_id: uuid.UUID,
    movement_date: date,
    amount_minor: int,
    movement_type: StaffMovementType,
    period_year: int | None = None,
    period_month: int | None = None,
    extra_days: int | None = None,
) -> DuplicateMatch | None:
    amount = abs(amount_minor)
    filters = [
        StaffLedgerEntry.employee_id == employee_id,
        StaffLedgerEntry.movement_date == movement_date,
        StaffLedgerEntry.movement_type == movement_type,
        func.abs(StaffLedgerEntry.amount_minor) == amount,
    ]
    if period_year is not None:
        filters.append(StaffLedgerEntry.period_year == period_year)
    if period_month is not None:
        filters.append(StaffLedgerEntry.period_month == period_month)
    if extra_days is not None:
        filters.append(StaffLedgerEntry.extra_days == extra_days)

    row_id = session.scalar(
        select(StaffLedgerEntry.id)
        .outerjoin(JournalEntry, StaffLedgerEntry.journal_entry_id == JournalEntry.id)
        .where(*filters, _live_journal_filter(StaffLedgerEntry.journal_entry_id))
        .limit(1)
    )
    if row_id is None:
        return None

    kind_label = {
        StaffMovementType.SALARY_ACCRUED: "salary accrual",
        StaffMovementType.SALARY_PAYMENT: "salary payment",
        StaffMovementType.ADVANCE_PAID: "salary advance",
        StaffMovementType.EXTRA_DAYS_ACCRUED: "extra days accrual",
        StaffMovementType.EXTRA_DAYS_PAID: "extra days payment",
        StaffMovementType.INCENTIVE_PAID: "incentive payment",
    }.get(movement_type, movement_type.value.replace("_", " "))

    return DuplicateMatch(
        record_kind="staff",
        existing_id=row_id,
        message=(
            f"A {kind_label} for {_format_try(amount)} on "
            f"{_format_tr_date(movement_date)} already exists for this employee."
        ),
    )
