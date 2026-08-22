"""Staff feature service — employees + posting wrappers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.core.staff import posting as staff_posting
from app.core.staff.ledger import (
    current_balance_minor,
    list_ledger_entries,
    outstanding_advance_minor,
    period_accrued_minor,
    period_paid_minor,
    period_remaining_minor,
    remaining_accrual_minor,
)
from app.core.staff.models import StaffLedgerEntry
from app.core.duplicate_guard import (
    ensure_not_duplicate,
    find_duplicate_staff_movement,
)
from app.core.staff.types import PayCurrency, StaffMovementType
from app.core.ledger.correction import (
    CorrectionNotFoundError,
    correct_staff_journal_entry,
    void_staff_journal_entry,
)
from app.core.ledger.posting import PostingLine
from app.core.ledger.subledger_display import enrich_entry_models
from app.core.staff.ledger_effective import collapse_accrual_entry_reads
from app.core.banking.manual_cash import require_manual_cash_payment_account
from app.features.ledger.entry_actions_for_rows import entry_actions_for_rows
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.staff.correction_lines import build_staff_correction_lines
from app.features.staff.models import Employee
from app.features.staff.schema import (
    EmployeeCreate,
    EmployeeUpdate,
    StaffAccrualCreate,
    StaffAccrualResponse,
    StaffAdvanceCreate,
    StaffAdvanceReturnCreate,
    StaffAdvanceResponse,
    StaffExtraDaysPaidCreate,
    StaffExtraDaysPaidResponse,
    StaffLedgerEntryRead,
    StaffLedgerRead,
    StaffPaymentCreate,
    StaffPaymentResponse,
    SalaryPeriodStatusRead,
    StaffJournalEntryCorrect,
    StaffJournalEntryCorrectOut,
)


def _staff_entry_reads(
    session: Session, entries: list[StaffLedgerEntry]
) -> list[StaffLedgerEntryRead]:
    if not entries:
        return []
    reads = enrich_entry_models(
        session,
        StaffLedgerEntryRead,
        entries,
        journal_entry_id=lambda entry: entry.journal_entry_id,
        description=lambda entry: entry.description,
    )
    reads = collapse_accrual_entry_reads(reads)

    # Restore the money account each advance/salary payment was paid from.
    from app.core.staff.types import StaffMovementType
    from app.features.banking.journal_money_account import (
        money_account_gl_by_journal_entry,
    )

    payment_je_ids = [
        r.journal_entry_id
        for r in reads
        if r.movement_type
        in (StaffMovementType.ADVANCE_PAID, StaffMovementType.SALARY_PAYMENT)
        and r.journal_entry_id is not None
    ]
    if payment_je_ids:
        account_by_je = money_account_gl_by_journal_entry(session, payment_je_ids)
        for r in reads:
            if r.journal_entry_id in account_by_je:
                r.payment_account_id = account_by_je[r.journal_entry_id]

    from app.features.staff.ledger_display_description import (
        apply_staff_ledger_descriptions,
    )

    apply_staff_ledger_descriptions(session, entries, reads)
    return reads


def _staff_entry_read(
    session: Session, entry: StaffLedgerEntry, *, entity_id: uuid.UUID
) -> StaffLedgerEntryRead:
    with entity_context(session, entity_id):
        require_entity_context()
        return _staff_entry_reads(session, [entry])[0]


def create_employee(
    session: Session, entity_id: uuid.UUID, payload: EmployeeCreate
) -> Employee:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        employee = Employee(
            name=payload.name,
            pay_currency=payload.pay_currency,
            notes=payload.notes,
        )
        session.add(employee)
        session.commit()
        session.refresh(employee)
        return employee


def list_employees(
    session: Session,
    entity_id: uuid.UUID,
    *,
    include_inactive: bool = False,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[Employee], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if not include_inactive:
            filters.append(Employee.is_active.is_(True))
        search = text_search_filter(q, Employee.name)
        if search is not None:
            filters.append(search)
        stmt = (
            select(Employee)
            .where(*filters)
            .order_by(Employee.is_active.desc(), Employee.name)
        )
        return fetch_paginated(session, stmt, params)


def get_employee(
    session: Session, entity_id: uuid.UUID, employee_id: uuid.UUID
) -> Employee:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        employee = session.get(Employee, employee_id)
        if employee is None:
            raise LookupError("Employee not found")
        return employee


def update_employee(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: EmployeeUpdate,
) -> Employee:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        employee = session.get(Employee, employee_id)
        if employee is None:
            raise LookupError("Employee not found")

        if payload.name is not None:
            employee.name = payload.name
        if payload.notes is not None:
            employee.notes = payload.notes
        if payload.is_active is not None:
            employee.is_active = payload.is_active

        session.commit()
        session.refresh(employee)
        return employee


def get_staff_ledger(
    session: Session, entity_id: uuid.UUID, employee_id: uuid.UUID
) -> StaffLedgerRead:
    with entity_context(session, entity_id):
        require_entity_context()
        balance = current_balance_minor(session, entity_id, employee_id)
        entries = list_ledger_entries(session, entity_id, employee_id)
        remaining = remaining_accrual_minor(session, employee_id)
        advance = outstanding_advance_minor(session, employee_id)
        reads = _staff_entry_reads(session, entries)
    # Sent with the rows so the page never decides this for itself. It used to,
    # and drifted twice: it withheld Edit from any payment that consumed an
    # advance, and kept calling a partner-funded salary void-only after that
    # became correctable.
    entry_actions = entry_actions_for_rows(session, entity_id, reads)
    return StaffLedgerRead(
        employee_id=employee_id,
        balance_minor=balance,
        remaining_accrual_minor=remaining,
        outstanding_advance_minor=advance,
        entries=reads,
        entry_actions=entry_actions,
    )


def _settle_advance(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    on_date: date,
    actor_id: uuid.UUID,
) -> None:
    """Hold the invariant after a write: owed and advance held cannot overlap.

    On the service, beside `require_manual_cash_payment_account`, and for the
    same reason — the statement classifier drives the posters directly and must
    not have a tidy-up entry posted underneath it.

    Called after the write rather than before, because it is the write that
    creates the overlap. It never raises: see the module it calls into.

    **It commits, and a commit expires every instance in the session.** So the
    caller's own posting result — the journal entry and subledger row it is
    about to build a response from — is expired by the time this returns.
    Touching one then refreshes it, and a refresh outside an entity context
    reads through RLS with no entity set, finds nothing, and raises
    `ObjectDeletedError` on a row that is perfectly well there.

    That is why every caller wraps its response in `entity_context`. It is the
    same trap as ARCHITECTURE.md's "read fields before the context closes",
    reached from the other end: here the fields are read late, so the context
    has to be reopened around them rather than the read moved earlier.
    """
    from app.core.staff.advance_settlement import settle_advance_against_owed

    settle_advance_against_owed(
        session, entity_id, employee_id, on_date=on_date, actor_id=actor_id
    )


def record_accrual(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: StaffAccrualCreate,
) -> StaffAccrualResponse:
    employee = get_employee(session, entity_id, employee_id)
    from app.features.staff.ledger_display_description import (
        compose_staff_post_description,
    )

    description = compose_staff_post_description(
        movement_type=StaffMovementType.SALARY_ACCRUED.value,
        employee_name=employee.name,
        period_year=payload.period_year,
        period_month=payload.period_month,
        raw_note=payload.description,
    )
    with entity_context(session, entity_id):
        require_entity_context()
        ensure_not_duplicate(
            find_duplicate_staff_movement(
                session,
                employee_id=employee_id,
                movement_date=payload.accrual_date,
                amount_minor=payload.amount_minor,
                movement_type=StaffMovementType.SALARY_ACCRUED,
                period_year=payload.period_year,
                period_month=payload.period_month,
            ),
            acknowledged=payload.acknowledge_duplicate,
        )
    result = staff_posting.post_salary_accrual(
        session,
        entity_id,
        employee_id,
        accrual_date=payload.accrual_date,
        amount_minor=payload.amount_minor,
        description=description,
        actor_id=payload.actor_id,
        period_year=payload.period_year,
        period_month=payload.period_month,
    )
    _settle_advance(session, entity_id, employee_id, payload.accrual_date, payload.actor_id)
    with entity_context(session, entity_id):
        return StaffAccrualResponse(
            journal_entry_id=result.journal_entry.id if result.journal_entry else None,
            staff_ledger_entry=_staff_entry_read(
                session, result.staff_ledger_entry, entity_id=entity_id
            ),
            balance_minor=result.balance_minor,
        )


def record_advance(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: StaffAdvanceCreate,
) -> StaffAdvanceResponse:
    require_manual_cash_payment_account(session, entity_id, payload.payment_account_id)
    employee = get_employee(session, entity_id, employee_id)
    from app.features.staff.ledger_display_description import (
        compose_staff_post_description,
    )

    description = compose_staff_post_description(
        movement_type=StaffMovementType.ADVANCE_PAID.value,
        employee_name=employee.name,
        raw_note=payload.description,
    )
    with entity_context(session, entity_id):
        require_entity_context()
        ensure_not_duplicate(
            find_duplicate_staff_movement(
                session,
                employee_id=employee_id,
                movement_date=payload.payment_date,
                amount_minor=-payload.amount_minor,
                movement_type=StaffMovementType.ADVANCE_PAID,
            ),
            acknowledged=payload.acknowledge_duplicate,
        )
    result = staff_posting.post_advance_paid(
        session,
        entity_id,
        employee_id,
        payment_date=payload.payment_date,
        amount_minor=payload.amount_minor,
        description=description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
        fx_money_account_id=payload.fx_money_account_id,
        try_cost_kurus=payload.try_cost_kurus,
    )
    _settle_advance(session, entity_id, employee_id, payload.payment_date, payload.actor_id)
    with entity_context(session, entity_id):
        return StaffAdvanceResponse(
            journal_entry_id=result.journal_entry.id,
            staff_ledger_entry=_staff_entry_read(
                session, result.staff_ledger_entry, entity_id=entity_id
            ),
            balance_minor=result.balance_minor,
            fx_ledger_entry_id=(
                result.fx_ledger_entry.id if result.fx_ledger_entry else None
            ),
        )


def record_advance_return(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: StaffAdvanceReturnCreate,
) -> StaffAdvanceResponse:
    require_manual_cash_payment_account(session, entity_id, payload.payment_account_id)
    employee = get_employee(session, entity_id, employee_id)
    from app.features.staff.ledger_display_description import (
        compose_staff_post_description,
    )

    description = compose_staff_post_description(
        movement_type=StaffMovementType.ADVANCE_RETURNED.value,
        employee_name=employee.name,
        raw_note=payload.description,
    )
    with entity_context(session, entity_id):
        require_entity_context()
        ensure_not_duplicate(
            find_duplicate_staff_movement(
                session,
                employee_id=employee_id,
                movement_date=payload.payment_date,
                amount_minor=payload.amount_minor,
                movement_type=StaffMovementType.ADVANCE_RETURNED,
            ),
            acknowledged=payload.acknowledge_duplicate,
        )
    result = staff_posting.post_advance_returned(
        session,
        entity_id,
        employee_id,
        payment_date=payload.payment_date,
        amount_minor=payload.amount_minor,
        description=description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
    )
    _settle_advance(session, entity_id, employee_id, payload.payment_date, payload.actor_id)
    with entity_context(session, entity_id):
        return StaffAdvanceResponse(
            journal_entry_id=result.journal_entry.id,
            staff_ledger_entry=_staff_entry_read(
                session, result.staff_ledger_entry, entity_id=entity_id
            ),
            balance_minor=result.balance_minor,
            fx_ledger_entry_id=None,
    )


def get_salary_period_status(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    *,
    period_year: int,
    period_month: int,
    period_salary_minor: int | None = None,
) -> SalaryPeriodStatusRead:
    get_employee(session, entity_id, employee_id)
    with entity_context(session, entity_id):
        require_entity_context()
        accrued = period_accrued_minor(
            session, employee_id, period_year=period_year, period_month=period_month
        )
        paid = period_paid_minor(
            session, employee_id, period_year=period_year, period_month=period_month
        )
        salary_target = period_salary_minor if period_salary_minor is not None else accrued
        remaining = period_remaining_minor(
            session,
            employee_id,
            period_year=period_year,
            period_month=period_month,
            period_salary_minor=salary_target,
        )
        advance = outstanding_advance_minor(session, employee_id)
        # Payments accrue the month at post time, so the preview's "owed" must
        # include the part of this period's salary not yet accrued.
        total_owed = remaining_accrual_minor(session, employee_id) + max(
            0, salary_target - accrued
        )
    return SalaryPeriodStatusRead(
        employee_id=employee_id,
        period_year=period_year,
        period_month=period_month,
        period_salary_minor=salary_target,
        period_paid_minor=paid,
        period_remaining_minor=remaining,
        outstanding_advance_minor=advance,
        total_owed_minor=total_owed,
    )


def _format_extra_days_description(extra_days: int, per_day_minor: int) -> str:
    per_day = per_day_minor / 100
    return f"Extra days ({extra_days} × {per_day:,.2f} ₺/day)"


def record_extra_days_paid(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: StaffExtraDaysPaidCreate,
) -> StaffExtraDaysPaidResponse:
    require_manual_cash_payment_account(session, entity_id, payload.payment_account_id)
    employee = get_employee(session, entity_id, employee_id)
    if employee.pay_currency != PayCurrency.TRY:
        raise ValueError("Extra days pay is recorded in TRY — use Advance for FX employees")

    description = payload.description
    if not description or not description.strip():
        description = _format_extra_days_description(
            payload.extra_days, payload.per_day_minor
        )

    total_minor = payload.extra_days * payload.per_day_minor
    movement_type = (
        StaffMovementType.EXTRA_DAYS_PAID
        if payload.payment_account_id is not None
        else StaffMovementType.EXTRA_DAYS_ACCRUED
    )
    signed_amount = (
        -total_minor if movement_type == StaffMovementType.EXTRA_DAYS_PAID else total_minor
    )
    with entity_context(session, entity_id):
        require_entity_context()
        ensure_not_duplicate(
            find_duplicate_staff_movement(
                session,
                employee_id=employee_id,
                movement_date=payload.payment_date,
                amount_minor=signed_amount,
                movement_type=movement_type,
                extra_days=payload.extra_days,
            ),
            acknowledged=payload.acknowledge_duplicate,
        )
    result = staff_posting.post_extra_days_paid(
        session,
        entity_id,
        employee_id,
        payment_date=payload.payment_date,
        extra_days=payload.extra_days,
        per_day_minor=payload.per_day_minor,
        description=description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
    )
    journal_id = result.journal_entry.id if result.journal_entry else None
    if journal_id is None:
        raise ValueError("Extra days record did not produce a journal entry")
    _settle_advance(session, entity_id, employee_id, payload.payment_date, payload.actor_id)
    with entity_context(session, entity_id):
        return StaffExtraDaysPaidResponse(
            journal_entry_id=journal_id,
            staff_ledger_entry=_staff_entry_read(
                session, result.staff_ledger_entry, entity_id=entity_id
            ),
            balance_minor=result.balance_minor,
            total_minor=total_minor,
        )


def record_payment(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: StaffPaymentCreate,
) -> StaffPaymentResponse:
    require_manual_cash_payment_account(session, entity_id, payload.payment_account_id)
    employee = get_employee(session, entity_id, employee_id)
    from app.features.staff.ledger_display_description import (
        compose_staff_post_description,
    )

    description = compose_staff_post_description(
        movement_type=StaffMovementType.SALARY_PAYMENT.value,
        employee_name=employee.name,
        period_year=payload.period_year,
        period_month=payload.period_month,
        raw_note=payload.description,
    )
    with entity_context(session, entity_id):
        require_entity_context()
        if payload.amount_minor == 0:
            ensure_not_duplicate(
                find_duplicate_staff_movement(
                    session,
                    employee_id=employee_id,
                    movement_date=payload.payment_date,
                    amount_minor=payload.period_salary_minor,
                    movement_type=StaffMovementType.SALARY_ACCRUED,
                    period_year=payload.period_year,
                    period_month=payload.period_month,
                ),
                acknowledged=payload.acknowledge_duplicate,
            )
        else:
            ensure_not_duplicate(
                find_duplicate_staff_movement(
                    session,
                    employee_id=employee_id,
                    movement_date=payload.payment_date,
                    amount_minor=-payload.amount_minor,
                    movement_type=StaffMovementType.SALARY_PAYMENT,
                    period_year=payload.period_year,
                    period_month=payload.period_month,
                ),
                acknowledged=payload.acknowledge_duplicate,
            )

    result = staff_posting.post_period_salary_payment(
        session,
        entity_id,
        employee_id,
        payment_date=payload.payment_date,
        cash_minor=payload.amount_minor,
        period_year=payload.period_year,
        period_month=payload.period_month,
        period_salary_minor=payload.period_salary_minor,
        description=description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
        fx_money_account_id=payload.fx_money_account_id,
        try_cost_kurus=payload.try_cost_kurus,
        extra_days=payload.extra_days,
        per_day_minor=payload.per_day_minor,
    )
    _settle_advance(session, entity_id, employee_id, payload.payment_date, payload.actor_id)
    with entity_context(session, entity_id):
        return StaffPaymentResponse(
            journal_entry_id=result.journal_entry.id,
            staff_ledger_entry=_staff_entry_read(
                session, result.staff_ledger_entry, entity_id=entity_id
            ),
            balance_minor=result.balance_minor,
            advance_applied_minor=result.advance_applied_minor,
            fx_ledger_entry_id=(
                result.fx_ledger_entry.id if result.fx_ledger_entry else None
            ),
        )


def _staff_row_for_correction(
    session: Session,
    journal_entry_id: uuid.UUID,
    employee_id: uuid.UUID,
) -> StaffLedgerEntry:
    rows = list(
        session.scalars(
            select(StaffLedgerEntry).where(
                StaffLedgerEntry.journal_entry_id == journal_entry_id,
                StaffLedgerEntry.employee_id == employee_id,
                StaffLedgerEntry.movement_type != StaffMovementType.ADVANCE_APPLIED,
            )
        )
    )
    if not rows:
        raise CorrectionNotFoundError("staff ledger entry not found for journal entry")
    if len(rows) > 1:
        raise CorrectionNotFoundError(
            "journal entry has multiple correctable staff rows — use dedicated flow"
        )
    return rows[0]


def _is_multi_row_staff_payment(
    session: Session, entity_id: uuid.UUID, journal_entry_id: uuid.UUID
) -> bool:
    """A staff payment entry owning more than one subledger row.

    The single-row correction below rebuilds one row and would drop the others,
    which is why it used to refuse these outright.
    """
    from app.core.ledger.models import JournalEntry, JournalEntrySource

    with entity_context(session, entity_id):
        require_entity_context()
        entry = session.get(JournalEntry, journal_entry_id)
        if entry is None or entry.source != JournalEntrySource.STAFF_PAYMENT:
            return False
        rows = session.scalars(
            select(StaffLedgerEntry).where(
                StaffLedgerEntry.journal_entry_id == journal_entry_id
            )
        ).all()
        return len(rows) > 1


def _correct_staff_payment_http(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: StaffJournalEntryCorrect,
) -> StaffJournalEntryCorrectOut:
    from app.core.staff.payment_correction import correct_staff_payment

    if payload.amount_minor is None:
        raise ValueError("amount_minor is required when correcting a staff payment")

    result = correct_staff_payment(
        session,
        entity_id,
        journal_entry_id,
        payment_date=payload.entry_date,
        amount_minor=payload.amount_minor,
        description=payload.description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
        reason=payload.reason,
        void_date=payload.void_date,
        period_unlock_reason=payload.period_unlock_reason,
    )
    posted = result.corrected
    _settle_advance(session, entity_id, employee_id, payload.entry_date, payload.actor_id)
    with entity_context(session, entity_id):
        return StaffJournalEntryCorrectOut(
            original_journal_entry_id=result.original_journal_entry.id,
            reversal_journal_entry_id=result.reversal_journal_entry.id,
            corrected_journal_entry_id=posted.journal_entry.id,
            staff_ledger_entry=_staff_entry_read(
                session, posted.staff_ledger_entry, entity_id=entity_id
            ),
            balance_minor=current_balance_minor(session, entity_id, employee_id),
        )


def correct_staff_journal_entry_http(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: StaffJournalEntryCorrect,
) -> StaffJournalEntryCorrectOut:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    if _is_multi_row_staff_payment(session, entity_id, journal_entry_id):
        # A payment that consumed an advance, or parked a surplus as one, owns
        # two or three rows. Rebuilding a single row would drop the rest, so
        # this reverses the entry whole and reposts through the poster that
        # wrote it — see `core/staff/payment_correction.py`.
        return _correct_staff_payment_http(
            session, entity_id, employee_id, journal_entry_id, payload
        )

    with entity_context(session, entity_id):
        require_entity_context()
        staff_row = _staff_row_for_correction(session, journal_entry_id, employee_id)
        lines, amount_minor, try_cost = build_staff_correction_lines(
            session, entity_id, employee_id, staff_row, payload
        )

    result = correct_staff_journal_entry(
        session,
        entity_id,
        journal_entry_id,
        payload.entry_date,
        payload.description,
        lines,
        actor_id=payload.actor_id,
        amount_minor=amount_minor,
        try_cost_kurus=try_cost,
        extra_days=payload.extra_days,
        reason=payload.reason,
        void_date=payload.void_date,
        period_unlock_reason=payload.period_unlock_reason,
    )
    balance = current_balance_minor(session, entity_id, employee_id)
    with entity_context(session, entity_id):
        new_row = session.scalar(
            select(StaffLedgerEntry).where(
                StaffLedgerEntry.journal_entry_id == result.corrected.id,
                StaffLedgerEntry.movement_type == staff_row.movement_type,
            )
        )
    if new_row is None:
        raise CorrectionNotFoundError("corrected staff ledger entry not found")

    # Read after the settle, not before — editing an accrual upward is the
    # route that strands an advance without any payment being involved, and
    # it is how Yasir Khan's 2.730 arose on both sides.
    _settle_advance(session, entity_id, employee_id, payload.entry_date, payload.actor_id)
    with entity_context(session, entity_id):
        balance = current_balance_minor(session, entity_id, employee_id)
        return StaffJournalEntryCorrectOut(
            original_journal_entry_id=result.original.id,
            reversal_journal_entry_id=result.reversal.id,
            corrected_journal_entry_id=result.corrected.id,
            staff_ledger_entry=_staff_entry_read(session, new_row, entity_id=entity_id),
            balance_minor=balance,
        )


def _assert_staff_journal_for_employee(
    session: Session,
    journal_entry_id: uuid.UUID,
    employee_id: uuid.UUID,
) -> None:
    row = session.scalar(
        select(StaffLedgerEntry.id).where(
            StaffLedgerEntry.journal_entry_id == journal_entry_id,
            StaffLedgerEntry.employee_id == employee_id,
        )
    )
    if row is None:
        raise CorrectionNotFoundError("staff ledger entry not found for journal entry")


def void_staff_journal_entry_http(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
):
    from app.features.ledger.schema import SubledgerVoidOut

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _assert_staff_journal_for_employee(session, journal_entry_id, employee_id)

    result = void_staff_journal_entry(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
    )
    # The statement-line reset used to be done here by hand. It now happens
    # inside the void machinery itself, so staff is no longer the one path in
    # six that remembered — and this no longer has to.
    original_id = result.original.id
    reversal_id = result.reversal.id
    # Voiding a payment puts back whatever it had settled, which can leave the
    # two sides overlapping again.
    _settle_advance(
        session, entity_id, employee_id, void_date or date.today(), actor_id
    )
    return SubledgerVoidOut(
        original_journal_entry_id=original_id,
        reversal_journal_entry_id=reversal_id,
    )
