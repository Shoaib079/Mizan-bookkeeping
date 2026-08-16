"""Correcting a partner-paid salary: void the whole entry, then repost.

Kept apart from the posting and the void because it is a different decision
rather than a longer one. Everything else in the partner ledger is corrected by
rebuilding its GL lines and rewriting a single subledger row; this entry has
rows in two subledgers at once, so that approach would rewrite one and orphan
the other. See the docstring on the function.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ledger.correction.registry import CorrectionNotFoundError
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.core.staff import ledger as staff_ledger
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.partner_funded_payment import (
    InvalidPartnerFundedSalaryError,
    PartnerFundedSalaryPostResult,
    post_partner_funded_period_salary,
    void_partner_funded_salary,
)
from app.core.staff.types import StaffMovementType
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service


@dataclass(frozen=True, slots=True)
class PartnerFundedSalaryCorrectionResult:
    original_journal_entry: JournalEntry
    reversal_journal_entry: JournalEntry
    corrected: PartnerFundedSalaryPostResult


def correct_partner_funded_salary(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    payment_date: date,
    amount_minor: int,
    description: str,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> PartnerFundedSalaryCorrectionResult:
    """Correct a partner-funded salary by voiding it whole and reposting.

    Every other partner movement is corrected by rebuilding its GL lines and
    rewriting one subledger row. That cannot work here, and the reason this
    was void-only for so long: one journal entry writes a staff row for the
    salary, sometimes a second for an advance it consumed, sometimes a third
    for an excess paid as a new advance, *and* a partner row for what the
    business now owes. Rebuilding from the partner row alone would rewrite
    that one and leave the staff rows describing a payment that no longer
    exists.

    So it does what `correct_profit_allocation` does for the same reason:
    reverses the whole entry, then posts a new one. The reversal stays in the
    books and the original reads as corrected, which is the same audit trail
    every other correction leaves.

    **The accrual does not move.** What an employee earned is a separate
    journal entry that this payment merely settles, and voiding a payment
    deliberately leaves it standing. So the repost is handed the period's
    *current* accrued figure, which makes `_ensure_period_accrual_up_to` a
    no-op, and no extra days — re-sending those would accrue them a second
    time on top of an accrual nobody reversed. Correcting what you paid must
    never change what the employee was owed.

    The advance arithmetic is recomputed rather than copied, and has to be:
    after the void the advance is outstanding again, so the new amount is
    applied against the real position rather than the one that existed before.
    """
    if amount_minor <= 0:
        raise InvalidPartnerFundedSalaryError(
            "amount_minor must be positive for partner-funded salary"
        )
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        entry = session.get(JournalEntry, journal_entry_id)
        if entry is None or entry.entity_id != entity_id:
            raise CorrectionNotFoundError("journal entry not found")
        if entry.source != JournalEntrySource.PARTNER_SALARY_FRONTED:
            raise CorrectionNotFoundError(
                "journal entry is not a partner-funded salary payment"
            )
        salary_row = session.scalar(
            select(StaffLedgerEntry).where(
                StaffLedgerEntry.journal_entry_id == journal_entry_id,
                StaffLedgerEntry.movement_type == StaffMovementType.SALARY_PAYMENT,
            )
        )
        partner_row = session.scalar(
            select(PartnerLedgerEntry).where(
                PartnerLedgerEntry.journal_entry_id == journal_entry_id,
                PartnerLedgerEntry.movement_type == PartnerMovementType.SALARY_FRONTED,
            )
        )
        if salary_row is None or partner_row is None:
            raise CorrectionNotFoundError(
                "partner-funded salary is missing staff or partner ledger rows"
            )
        # Read before anything closes the context — see the RLS note in
        # `db/session.py`: touching a detached instance later refreshes it
        # with no entity set and it reads as deleted.
        employee_id = salary_row.employee_id
        partner_id = partner_row.partner_id
        period_year = salary_row.period_year
        period_month = salary_row.period_month
        if period_year is None or period_month is None:
            raise CorrectionNotFoundError(
                "partner-funded salary row has no period to repost against"
            )

    voided = void_partner_funded_salary(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason or "Corrected",
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
    )

    with entity_context(session, entity_id):
        require_entity_context()
        accrued = staff_ledger.period_accrued_minor(
            session,
            employee_id,
            period_year=period_year,
            period_month=period_month,
        )

    corrected = post_partner_funded_period_salary(
        session,
        entity_id,
        employee_id,
        partner_id,
        payment_date=payment_date,
        amount_minor=amount_minor,
        period_year=period_year,
        period_month=period_month,
        # The accrual as it already stands, so the ensure step returns early.
        period_salary_minor=accrued,
        description=description,
        actor_id=actor_id,
    )
    return PartnerFundedSalaryCorrectionResult(
        original_journal_entry=voided.original,
        reversal_journal_entry=voided.reversal,
        corrected=corrected,
    )
