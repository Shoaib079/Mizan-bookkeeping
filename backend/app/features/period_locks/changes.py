"""What moved a sealed month after it was closed.

Slice 1 flags a closed month as `dirty` and slice 2 states the size of the
drift. Neither answers the question the owner actually has, which is *which
entry*. "Your June profit is 2.500 ₺ lower than when you closed it" is only
half a sentence.

Two things can move a sealed month, and both must be caught:

1. **Something new was posted into it.** The entry is dated inside the month
   but was created after the close.
2. **Something already in it was voided.** The original keeps its creation
   date — it was there when the month closed — so only `voided_at` reveals it.
   The void's reversal entry is caught by (1) as well, which is why reversals
   are labelled rather than hidden: seeing both halves is the point of an
   audit trail.

The stated reasons are returned alongside rather than joined to the entries.
`UNLOCK_WRITE` audit events are written by the posting guard *before* the entry
exists, so they carry no journal entry id. Correlating them by timestamp would
look precise and occasionally be wrong, which is worse than presenting them as
what they are: the reasons given, in order.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine
from app.core.period_locks.models import (
    PeriodLock,
    PeriodLockAuditAction,
    PeriodLockAuditEvent,
)
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service

__all__ = ["SealedMonthChanges", "ChangedEntry", "UnlockReason", "get_sealed_month_changes"]

#: What a row is telling you about the entry.
CHANGE_POSTED = "posted"
CHANGE_VOIDED = "voided"
CHANGE_REVERSAL = "reversal"


@dataclass(frozen=True)
class ChangedEntry:
    journal_entry_id: uuid.UUID
    entry_date: date
    description: str
    source: str
    status: str
    amount_kurus: int
    #: When this change happened — creation for a new entry, void time for a void.
    changed_at: datetime
    change_kind: str
    #: For a reversal, the entry it reverses.
    reverses_entry_id: uuid.UUID | None = None


@dataclass(frozen=True)
class UnlockReason:
    actor_id: uuid.UUID
    reason: str | None
    created_at: datetime


@dataclass
class SealedMonthChanges:
    lock_id: uuid.UUID
    period_start: date
    period_end: date
    closed_at: datetime
    dirty: bool
    entries: list[ChangedEntry] = field(default_factory=list)
    reasons: list[UnlockReason] = field(default_factory=list)


def _entry_amount_kurus(session: Session, entry_id: uuid.UUID) -> int:
    """One side of the entry — debits and credits are equal by construction."""
    return int(
        session.scalar(
            select(func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0)).where(
                JournalEntryLine.journal_entry_id == entry_id,
                JournalEntryLine.side == AccountNormalBalance.DEBIT,
            )
        )
        or 0
    )


def _change_kind(entry: JournalEntry, *, voided_after_close: bool) -> str:
    if voided_after_close:
        return CHANGE_VOIDED
    if entry.reverses_entry_id is not None:
        return CHANGE_REVERSAL
    return CHANGE_POSTED


def get_sealed_month_changes(
    session: Session, entity_id: uuid.UUID, lock_id: uuid.UUID
) -> SealedMonthChanges:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        lock = session.get(PeriodLock, lock_id)
        if lock is None:
            raise LookupError("Period lock not found")

        closed_at = lock.closed_at
        in_period = (
            JournalEntry.entry_date >= lock.period_start,
            JournalEntry.entry_date <= lock.period_end,
        )

        posted_after = list(
            session.scalars(
                select(JournalEntry).where(
                    *in_period, JournalEntry.created_at > closed_at
                )
            )
        )
        voided_after = list(
            session.scalars(
                select(JournalEntry).where(
                    *in_period,
                    JournalEntry.voided_at.isnot(None),
                    JournalEntry.voided_at > closed_at,
                    # Created before the close, or it's already in posted_after
                    # and would otherwise appear twice.
                    JournalEntry.created_at <= closed_at,
                )
            )
        )

        rows: list[ChangedEntry] = []
        for entry, voided in [(e, False) for e in posted_after] + [
            (e, True) for e in voided_after
        ]:
            changed_at = entry.voided_at if voided else entry.created_at
            rows.append(
                ChangedEntry(
                    journal_entry_id=entry.id,
                    entry_date=entry.entry_date,
                    description=entry.description,
                    source=entry.source.value,
                    status=entry.status.value,
                    amount_kurus=_entry_amount_kurus(session, entry.id),
                    changed_at=changed_at,
                    change_kind=_change_kind(entry, voided_after_close=voided),
                    reverses_entry_id=entry.reverses_entry_id,
                )
            )
        # Newest first: the most recent change is the one being asked about.
        rows.sort(key=lambda r: r.changed_at, reverse=True)

        reason_rows = list(
            session.scalars(
                select(PeriodLockAuditEvent)
                .where(
                    PeriodLockAuditEvent.period_lock_id == lock.id,
                    PeriodLockAuditEvent.action == PeriodLockAuditAction.UNLOCK_WRITE,
                    PeriodLockAuditEvent.created_at > closed_at,
                )
                .order_by(PeriodLockAuditEvent.created_at.desc())
            )
        )

        return SealedMonthChanges(
            lock_id=lock.id,
            period_start=lock.period_start,
            period_end=lock.period_end,
            closed_at=closed_at,
            dirty=lock.dirty,
            entries=rows,
            reasons=[
                UnlockReason(
                    actor_id=r.actor_id, reason=r.reason, created_at=r.created_at
                )
                for r in reason_rows
            ],
        )
