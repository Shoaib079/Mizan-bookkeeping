"""Effective staff ledger rows — exclude superseded / void reversals from period math."""

from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntry
from app.core.ledger.subledger_display import (
    SubledgerDisplayKind,
    classify_subledger_row,
    load_journals_for_rows,
)
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.types import StaffMovementType
from app.db.session import require_entity_context
from app.features.staff.schema import StaffLedgerEntryRead


def staff_row_display_kind(
    session: Session,
    row: StaffLedgerEntry,
    *,
    journals: dict[uuid.UUID, JournalEntry] | None = None,
) -> SubledgerDisplayKind:
    journal: JournalEntry | None = None
    if row.journal_entry_id is not None:
        if journals is not None:
            journal = journals.get(row.journal_entry_id)
        else:
            journal = session.get(JournalEntry, row.journal_entry_id)
    kind, _ = classify_subledger_row(description=row.description, journal=journal)
    return kind


def effective_amount_minor(
    session: Session,
    row: StaffLedgerEntry,
    *,
    journals: dict[uuid.UUID, JournalEntry] | None = None,
) -> int:
    from app.core.ledger.subledger_effective import effective_amount

    if journals is None and row.journal_entry_id is not None:
        journals = load_journals_for_rows(session, [row.journal_entry_id])
    return effective_amount(
        session,
        journal_entry_id=row.journal_entry_id,
        description=row.description,
        amount=row.amount_minor,
        journals=journals,
    )


def effective_balance_minor(session: Session, employee_id: uuid.UUID) -> int:
    """Staff subledger balance — effective rows only (excludes voided / superseded)."""
    from sqlalchemy import select

    from app.core.ledger.subledger_effective import effective_total_for_scalars

    require_entity_context()
    rows = session.scalars(
        select(StaffLedgerEntry).where(StaffLedgerEntry.employee_id == employee_id)
    )
    return effective_total_for_scalars(
        session,
        rows,
        amount=lambda row: row.amount_minor,
        journal_entry_id=lambda row: row.journal_entry_id,
        description=lambda row: row.description,
    )


def effective_sum_by_type(
    session: Session, employee_id: uuid.UUID, movement_type: StaffMovementType
) -> int:
    from app.core.ledger.subledger_effective import effective_total_for_scalars

    require_entity_context()
    rows = session.scalars(
        select(StaffLedgerEntry).where(
            StaffLedgerEntry.employee_id == employee_id,
            StaffLedgerEntry.movement_type == movement_type,
        )
    )
    return effective_total_for_scalars(
        session,
        rows,
        amount=lambda row: row.amount_minor,
        journal_entry_id=lambda row: row.journal_entry_id,
        description=lambda row: row.description,
    )


def period_paid_minor_effective(
    session: Session, employee_id: uuid.UUID, *, period_year: int, period_month: int
) -> int:
    rows = session.scalars(
        select(StaffLedgerEntry).where(
            StaffLedgerEntry.employee_id == employee_id,
            StaffLedgerEntry.movement_type == StaffMovementType.SALARY_PAYMENT,
            StaffLedgerEntry.period_year == period_year,
            StaffLedgerEntry.period_month == period_month,
        )
    ).all()
    if not rows:
        return 0
    journals = load_journals_for_rows(session, [r.journal_entry_id for r in rows])
    total = sum(
        effective_amount_minor(session, row, journals=journals) for row in rows
    )
    return -total


def period_accrued_minor_effective(
    session: Session, employee_id: uuid.UUID, *, period_year: int, period_month: int
) -> int:
    rows = session.scalars(
        select(StaffLedgerEntry).where(
            StaffLedgerEntry.employee_id == employee_id,
            StaffLedgerEntry.movement_type == StaffMovementType.SALARY_ACCRUED,
            StaffLedgerEntry.period_year == period_year,
            StaffLedgerEntry.period_month == period_month,
        )
    ).all()
    if not rows:
        return 0
    journals = load_journals_for_rows(session, [r.journal_entry_id for r in rows])
    return sum(
        effective_amount_minor(session, row, journals=journals) for row in rows
    )


def effective_accrual_rows_for_period(
    session: Session,
    employee_id: uuid.UUID,
    *,
    period_year: int,
    period_month: int,
) -> list[StaffLedgerEntry]:
    rows = list(
        session.scalars(
            select(StaffLedgerEntry)
            .where(
                StaffLedgerEntry.employee_id == employee_id,
                StaffLedgerEntry.movement_type == StaffMovementType.SALARY_ACCRUED,
                StaffLedgerEntry.period_year == period_year,
                StaffLedgerEntry.period_month == period_month,
            )
            .order_by(StaffLedgerEntry.created_at)
        )
    )
    if not rows:
        return []
    journals = load_journals_for_rows(session, [r.journal_entry_id for r in rows])
    return [
        row
        for row in rows
        if staff_row_display_kind(session, row, journals=journals)
        == SubledgerDisplayKind.EFFECTIVE
    ]


def collapse_accrual_entry_reads(
    entries: list[StaffLedgerEntryRead],
) -> list[StaffLedgerEntryRead]:
    """Merge effective salary accruals that share a pay period into one display row."""
    if not entries:
        return entries

    accrual_groups: dict[tuple[int, int], list[StaffLedgerEntryRead]] = defaultdict(list)
    passthrough: list[StaffLedgerEntryRead] = []

    for entry in entries:
        if (
            entry.movement_type == StaffMovementType.SALARY_ACCRUED
            and entry.display_kind == SubledgerDisplayKind.EFFECTIVE
            and entry.period_year is not None
            and entry.period_month is not None
        ):
            accrual_groups[(entry.period_year, entry.period_month)].append(entry)
        else:
            passthrough.append(entry)

    collapsed: list[StaffLedgerEntryRead] = []
    for group in accrual_groups.values():
        if len(group) == 1:
            collapsed.append(group[0])
            continue
        latest = max(group, key=lambda row: (row.movement_date, row.created_at))
        total = sum(row.amount_minor for row in group)
        collapsed.append(
            latest.model_copy(
                update={
                    "amount_minor": total,
                    "was_corrected": any(row.was_corrected for row in group),
                    "description": f"Salary {latest.period_year}-{latest.period_month:02d}",
                }
            )
        )

    merged = passthrough + collapsed
    merged.sort(key=lambda row: (row.movement_date, row.created_at))
    return merged
