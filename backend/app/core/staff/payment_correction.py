"""Correcting a staff payment by reversing it whole and reposting.

`correct_staff_journal_entry` rebuilds exactly one subledger row, so it refuses
an entry that owns several — and a salary payment owns two or three: the
payment, the advance it consumed, and any surplus parked as a new advance. Its
own comment named the way out: *"Refusing is the honest answer until this can
rebuild every leg."* This is that.

**Why reposting rather than rebuilding the rows.** The legs are not stored
facts to be rewritten; they are derived at post time from the cash, what was
owed, and what advance was outstanding. Rebuilding them by hand would mean
writing that split a second time, and every disagreement this ledger has
produced came from one fact having two renderings. So the correction reverses
the entry — which restores the payable and the advance to what they were — and
then calls the same poster that wrote it, with the corrected inputs. The split
is computed once, by the code that owns it.

**Two shapes, told apart by the journal.** `post_apply_advance` moves no money
(Dr 2250 / Cr 1300 only); a salary payment always has one money line. That is
the whole discriminator, and `money_account_gl_by_journal_entry` already
answers it. Both write `JournalEntrySource.STAFF_PAYMENT`, so the source
cannot.

**The accrual does not move.** What an employee earned is a separate entry that
a payment merely settles, and voiding a payment deliberately leaves it
standing. The repost is handed the period's *current* accrued figure, making
the ensure-accrual step a no-op. Correcting what you paid must never change
what they were owed — to change that, edit the accrual row itself.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ledger.correction.machinery import SubledgerVoidResult
from app.core.ledger.correction.registry import CorrectionNotFoundError
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.staff import ledger as staff_ledger
from app.core.staff import posting as staff_posting
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.types import StaffMovementType
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service


@dataclass(frozen=True, slots=True)
class StaffPaymentCorrectionResult:
    original_journal_entry: JournalEntry
    reversal_journal_entry: JournalEntry
    corrected: staff_posting.StaffPaymentPostResult


@dataclass(frozen=True, slots=True)
class _Original:
    """What the entry being corrected was, read before anything reverses it."""

    employee_id: uuid.UUID
    period_year: int | None
    period_month: int | None
    money_gl_account_id: uuid.UUID | None

    @property
    def moved_money(self) -> bool:
        return self.money_gl_account_id is not None


def _read_original(
    session: Session, entity_id: uuid.UUID, journal_entry_id: uuid.UUID
) -> _Original:
    from app.features.banking.journal_money_account import (
        money_account_gl_by_journal_entry,
    )

    with entity_context(session, entity_id):
        require_entity_context()
        entry = session.get(JournalEntry, journal_entry_id)
        if entry is None or entry.entity_id != entity_id:
            raise CorrectionNotFoundError("journal entry not found")
        if entry.source != JournalEntrySource.STAFF_PAYMENT:
            raise CorrectionNotFoundError("journal entry is not a staff payment")

        payment_row = session.scalar(
            select(StaffLedgerEntry).where(
                StaffLedgerEntry.journal_entry_id == journal_entry_id,
                StaffLedgerEntry.movement_type == StaffMovementType.SALARY_PAYMENT,
            )
        )
        if payment_row is None:
            raise CorrectionNotFoundError(
                "staff payment has no salary payment row to correct"
            )
        # Read every field now: past the context these instances refresh with
        # no entity set and read as deleted.
        return _Original(
            employee_id=payment_row.employee_id,
            period_year=payment_row.period_year,
            period_month=payment_row.period_month,
            money_gl_account_id=money_account_gl_by_journal_entry(
                session, [journal_entry_id]
            ).get(journal_entry_id),
        )


def correct_staff_payment(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    payment_date: date,
    amount_minor: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID | None = None,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> StaffPaymentCorrectionResult:
    """Correct a salary payment or an apply-advance, every leg rebuilt.

    `amount_minor` is the cash actually paid. For an apply-advance, which moves
    no cash, it is the amount of advance to apply.
    """
    if amount_minor <= 0:
        raise staff_posting.InvalidStaffPostingError(
            "Corrected amount must be positive — void the entry to remove it"
        )
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    original = _read_original(session, entity_id, journal_entry_id)

    from app.core.ledger.correction.staff import void_staff_journal_entry

    voided: SubledgerVoidResult = void_staff_journal_entry(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason or "Corrected",
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
    )

    if not original.moved_money:
        corrected = staff_posting.post_apply_advance(
            session,
            entity_id,
            original.employee_id,
            applied_date=payment_date,
            description=description,
            actor_id=actor_id,
            amount_minor=amount_minor,
        )
        return StaffPaymentCorrectionResult(
            original_journal_entry=voided.original,
            reversal_journal_entry=voided.reversal,
            corrected=corrected,
        )

    if original.period_year is None or original.period_month is None:
        raise CorrectionNotFoundError(
            "staff payment row has no period to repost against"
        )

    with entity_context(session, entity_id):
        require_entity_context()
        # The accrual as it already stands, so the ensure step returns early
        # and what the employee earned is left exactly where it was.
        accrued = staff_ledger.period_accrued_minor(
            session,
            original.employee_id,
            period_year=original.period_year,
            period_month=original.period_month,
        )
    if accrued <= 0:
        raise CorrectionNotFoundError(
            "the period this payment settles has no accrual to repost against"
        )

    corrected = staff_posting.post_period_salary_payment(
        session,
        entity_id,
        original.employee_id,
        payment_date=payment_date,
        cash_minor=amount_minor,
        period_year=original.period_year,
        period_month=original.period_month,
        period_salary_minor=accrued,
        description=description,
        actor_id=actor_id,
        payment_account_id=payment_account_id or original.money_gl_account_id,
    )
    return StaffPaymentCorrectionResult(
        original_journal_entry=voided.original,
        reversal_journal_entry=voided.reversal,
        corrected=corrected,
    )
