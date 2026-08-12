"""Correcting and voiding an employee's accruals, advances and payments.

Lifted verbatim from `correction.py` when it was split.

`correct_staff_journal_entry` rewrites one subledger row, so it refuses an
entry that owns several: a salary payment that consumed an advance writes two
rows and a period payment writes three, and rebuilding one of those would
drop the rest and leave the employee's advance balance wrong with nothing on
screen to say so. Voiding stays available — it reverses the whole entry, and
every row of a staff entry belongs to the same employee.
"""

from __future__ import annotations

from app.core.fx.ledger import record_fx_movement
from app.core.fx.models import FxLedgerEntry
from app.core.ledger.correction.machinery import SubledgerCorrectionResult, SubledgerVoidResult, _append_staff_reversal, correct_gl_with_subledger_rows, void_gl_with_subledger_rows
from app.core.ledger.correction.registry import CorrectionNotFoundError
from app.core.ledger.models import JournalEntry
from app.core.ledger.posting import PostingLine
from app.core.staff import ledger as staff_ledger
from app.core.staff.models import StaffLedgerEntry
from app.db.session import entity_context, require_entity_context
from datetime import date
from sqlalchemy import select
from sqlalchemy.orm import Session
import uuid


def correct_staff_journal_entry(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    entry_date: date,
    description: str,
    lines: list[PostingLine],
    *,
    actor_id: uuid.UUID,
    amount_minor: int | None = None,
    try_cost_kurus: int | None = None,
    extra_days: int | None = None,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerCorrectionResult:
    with entity_context(session, entity_id):
        require_entity_context()
        staff_rows = list(
            session.scalars(
                select(StaffLedgerEntry).where(
                    StaffLedgerEntry.journal_entry_id == journal_entry_id
                )
            )
        )
        if not staff_rows:
            raise CorrectionNotFoundError("staff ledger entry not found for journal entry")
        if len(staff_rows) > 1:
            # This function reposts exactly one row. A salary payment that
            # consumed an advance writes two — the payment and the offset —
            # and a period payment writes three. Correcting one of those kept
            # whichever row the query happened to return first and dropped the
            # rest, leaving the employee's advance balance wrong with nothing
            # on screen to say so. `scalar` did not even promise which row
            # survived.
            #
            # Refusing is the honest answer until this can rebuild every leg.
            # Voiding still works and is correct: it reverses the whole entry,
            # and every row of a staff entry belongs to the same employee.
            raise CorrectionNotFoundError(
                f"this entry has {len(staff_rows)} staff ledger rows — "
                "correcting it would rebuild one and drop the others. Void it "
                "and re-enter."
            )
        staff_row = staff_rows[0]

        fx_row = session.scalar(
            select(FxLedgerEntry).where(FxLedgerEntry.journal_entry_id == journal_entry_id)
        )

        employee_id = staff_row.employee_id
        movement_type = staff_row.movement_type
        new_amount_minor = amount_minor if amount_minor is not None else staff_row.amount_minor
        new_try_cost = try_cost_kurus if try_cost_kurus is not None else staff_row.try_cost_kurus
        # Extra-days rows carry a day count; keep it (or take the corrected one)
        # so an edited entry doesn't lose "4 days × 950" on the way through.
        new_extra_days = extra_days if extra_days is not None else staff_row.extra_days

        def new_staff(sess: Session, corrected: JournalEntry) -> None:
            staff_ledger.persist_staff_ledger_entry(
                sess,
                employee_id,
                movement_date=entry_date,
                movement_type=movement_type,
                amount_minor=new_amount_minor,
                try_cost_kurus=new_try_cost,
                description=description,
                actor_id=actor_id,
                journal_entry_id=corrected.id,
                reference_type=staff_row.reference_type,
                reference_id=staff_row.reference_id,
                period_year=staff_row.period_year,
                period_month=staff_row.period_month,
                extra_days=new_extra_days,
            )

        def new_fx(sess: Session, corrected: JournalEntry) -> None:
            if fx_row is not None:
                record_fx_movement(
                    sess,
                    fx_row.fx_money_account_id,
                    movement_date=entry_date,
                    movement_type=fx_row.movement_type,
                    native_quantity=fx_row.native_quantity,
                    try_cost_kurus=fx_row.try_cost_kurus,
                    description=description,
                    actor_id=actor_id,
                    journal_entry_id=corrected.id,
                )

    return correct_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        entry_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        staff_row=staff_row,
        fx_row=fx_row,
        new_staff_row=new_staff,
        new_fx_row=new_fx if fx_row is not None else None,
    )


def void_staff_journal_entry(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    with entity_context(session, entity_id):
        require_entity_context()
        from app.core.ledger.models import JournalEntry, JournalEntrySource

        entry = session.get(JournalEntry, journal_entry_id)
        if entry is not None and entry.source == JournalEntrySource.PARTNER_SALARY_FRONTED:
            from app.core.staff.partner_funded_payment import void_partner_funded_salary

            # Dual-subledger void — never reverse staff without partner.
            return void_partner_funded_salary(
                session,
                entity_id,
                journal_entry_id,
                actor_id=actor_id,
                reason=reason,
                void_date=void_date,
                period_unlock_reason=period_unlock_reason,
            )
        staff_rows = list(
            session.scalars(
                select(StaffLedgerEntry).where(
                    StaffLedgerEntry.journal_entry_id == journal_entry_id
                )
            )
        )
        if not staff_rows:
            raise CorrectionNotFoundError("staff ledger entry not found for journal entry")
        fx_row = session.scalar(
            select(FxLedgerEntry).where(FxLedgerEntry.journal_entry_id == journal_entry_id)
        )

    def reverse_all_staff_rows(
        sess: Session,
        _original: JournalEntry,
        reversal: JournalEntry,
    ) -> None:
        for staff_row in staff_rows:
            _append_staff_reversal(
                sess, staff_row, reversal, actor_id=actor_id, void_date=void_date
            )

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        fx_row=fx_row,
        after_gl=reverse_all_staff_rows,
    )
