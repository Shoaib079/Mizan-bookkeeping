"""Freeze and read back the figures a closed month reported.

Balances are derived from live journal lines, and a void excludes both the
original entry and its reversal from every balance query. So voiding a January
entry in March makes January's P&L change retroactively, as if the entry never
existed (FINANCIAL_AUDIT F3). A month already sent to the accountant could
quietly become a different month.

Closing a month writes what every account read at that moment. Reports for a
sealed month then serve those figures, and the live books are still one click
away — so history is stable without pretending nothing changed.

Deliberately month-only: a day close is a drawer procedure, not a reporting
boundary, and snapshotting every day would write a row per account per day for
no reader.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.ledger.balances import (
    balance_as_of_kurus,
    debit_credit_activity_kurus,
    period_activity_kurus,
)
from app.core.period_locks.models import PeriodCloseSnapshot, PeriodLock, PeriodLockKind

__all__ = [
    "SnapshotFigures",
    "write_close_snapshot",
    "snapshot_figures_by_account",
    "active_month_lock",
]


@dataclass(frozen=True)
class SnapshotFigures:
    closing_balance_kurus: int
    period_activity_kurus: int
    period_debit_kurus: int
    period_credit_kurus: int


def write_close_snapshot(
    session: Session, lock: PeriodLock, *, period_start: date, period_end: date
) -> int:
    """Record every account's figures for this lock. Returns rows written.

    Must be called inside the caller's entity context and transaction so the
    snapshot commits with the lock — a lock without its snapshot would claim
    the month is sealed while still serving figures that can move.

    Re-closing replaces the previous set rather than versioning it: what a
    reader wants is what the month reads as *now*, and the close/reopen audit
    events already record that it was resealed.
    """
    session.execute(
        delete(PeriodCloseSnapshot).where(
            PeriodCloseSnapshot.period_lock_id == lock.id
        ),
        execution_options={"synchronize_session": False},
    )

    accounts = list(session.scalars(select(Account).order_by(Account.code)))
    written = 0
    for account in accounts:
        debits, credits = debit_credit_activity_kurus(
            session, account.id, period_start, period_end
        )
        session.add(
            PeriodCloseSnapshot(
                period_lock_id=lock.id,
                account_id=account.id,
                closing_balance_kurus=balance_as_of_kurus(session, account, period_end),
                period_activity_kurus=period_activity_kurus(
                    session, account, period_start, period_end
                ),
                period_debit_kurus=debits,
                period_credit_kurus=credits,
            )
        )
        written += 1
    return written


def active_month_lock(
    session: Session, *, period_start: date, period_end: date
) -> PeriodLock | None:
    """The month lock covering exactly this range, if it's still in force.

    Exact bounds, not overlap: a report for 15 June–15 July straddles two
    months and no single snapshot can answer it honestly, so it falls through
    to live figures.
    """
    return session.scalar(
        select(PeriodLock).where(
            PeriodLock.lock_kind == PeriodLockKind.MONTH,
            PeriodLock.period_start == period_start,
            PeriodLock.period_end == period_end,
            PeriodLock.reopened_at.is_(None),
        )
    )


def snapshot_figures_by_account(
    session: Session, lock_id: uuid.UUID
) -> dict[uuid.UUID, SnapshotFigures]:
    rows = session.scalars(
        select(PeriodCloseSnapshot).where(
            PeriodCloseSnapshot.period_lock_id == lock_id
        )
    )
    return {
        row.account_id: SnapshotFigures(
            closing_balance_kurus=row.closing_balance_kurus,
            period_activity_kurus=row.period_activity_kurus,
            period_debit_kurus=row.period_debit_kurus,
            period_credit_kurus=row.period_credit_kurus,
        )
        for row in rows
    }
