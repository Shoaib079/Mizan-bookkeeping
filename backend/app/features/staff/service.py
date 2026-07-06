"""Staff feature service — employees + posting wrappers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

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
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.staff.models import Employee
from app.features.staff.schema import (
    EmployeeCreate,
    EmployeeUpdate,
    StaffAccrualCreate,
    StaffAccrualResponse,
    StaffAdvanceCreate,
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
    return collapse_accrual_entry_reads(reads)


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
        stmt = select(Employee).where(*filters).order_by(Employee.name)
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
    return StaffLedgerRead(
        employee_id=employee_id,
        balance_minor=balance,
        remaining_accrual_minor=remaining,
        outstanding_advance_minor=advance,
        entries=reads,
    )


def record_accrual(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: StaffAccrualCreate,
) -> StaffAccrualResponse:
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
        description=payload.description,
        actor_id=payload.actor_id,
        period_year=payload.period_year,
        period_month=payload.period_month,
    )
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
        description=payload.description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
        fx_money_account_id=payload.fx_money_account_id,
        try_cost_kurus=payload.try_cost_kurus,
    )
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
    return SalaryPeriodStatusRead(
        employee_id=employee_id,
        period_year=period_year,
        period_month=period_month,
        period_salary_minor=salary_target,
        period_paid_minor=paid,
        period_remaining_minor=remaining,
        outstanding_advance_minor=advance,
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
        description=payload.description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
        fx_money_account_id=payload.fx_money_account_id,
        try_cost_kurus=payload.try_cost_kurus,
    )
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


def _build_staff_correction_lines(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    staff_row: StaffLedgerEntry,
    payload: StaffJournalEntryCorrect,
) -> tuple[list[PostingLine], int, int | None]:
    from app.core.chart_of_accounts.default_chart import (
        EMPLOYEE_ADVANCES_CODE,
        SALARIES_PAYABLE_CODE,
        SALARY_EXPENSE_CODE,
    )

    employee = staff_posting._get_employee(session, entity_id, employee_id)
    movement_type = staff_row.movement_type
    amount_minor = (
        payload.amount_minor if payload.amount_minor is not None else abs(staff_row.amount_minor)
    )
    try_cost = (
        payload.try_cost_kurus
        if payload.try_cost_kurus is not None
        else staff_row.try_cost_kurus
    )

    if movement_type == StaffMovementType.SALARY_ACCRUED:
        if employee.pay_currency != PayCurrency.TRY:
            raise ValueError("FX salary accrual has no GL entry to correct")
        salary_expense = staff_posting._chart_account(session, SALARY_EXPENSE_CODE)
        salaries_payable = staff_posting._chart_account(session, SALARIES_PAYABLE_CODE)
        lines = staff_posting.build_try_salary_accrual_lines(
            salary_expense_id=salary_expense.id,
            salaries_payable_id=salaries_payable.id,
            amount_kurus=amount_minor,
        )
        return lines, amount_minor, None

    if movement_type == StaffMovementType.ADVANCE_PAID:
        advances = staff_posting._chart_account(session, EMPLOYEE_ADVANCES_CODE)
        if employee.pay_currency == PayCurrency.TRY:
            if payload.payment_account_id is None:
                raise ValueError("payment_account_id required for TRY advance correction")
            payment_gl = staff_posting._validate_try_payment_account(
                session, entity_id, payload.payment_account_id
            )
            lines = staff_posting.build_try_advance_lines(
                employee_advances_id=advances.id,
                payment_account_id=payment_gl.id,
                amount_kurus=amount_minor,
            )
            return lines, -amount_minor, None

        if payload.fx_money_account_id is None or try_cost is None:
            raise ValueError(
                "fx_money_account_id and try_cost_kurus required for FX advance correction"
            )
        _, fx_gl = staff_posting._validate_fx_money_account(
            session, entity_id, payload.fx_money_account_id, employee.pay_currency
        )
        lines = staff_posting.build_fx_advance_lines(
            employee_advances_id=advances.id,
            fx_gl_account_id=fx_gl.id,
            try_cost_kurus=try_cost,
        )
        return lines, -amount_minor, try_cost

    if movement_type == StaffMovementType.SALARY_PAYMENT:
        sibling = session.scalar(
            select(StaffLedgerEntry).where(
                StaffLedgerEntry.journal_entry_id == staff_row.journal_entry_id,
                StaffLedgerEntry.movement_type == StaffMovementType.ADVANCE_APPLIED,
            )
        )
        if sibling is not None:
            raise ValueError(
                "salary payment with advance applied cannot be corrected via this endpoint yet"
            )

        if employee.pay_currency == PayCurrency.TRY:
            if payload.payment_account_id is None:
                raise ValueError("payment_account_id required for TRY payment correction")
            payment_gl = staff_posting._validate_try_payment_account(
                session, entity_id, payload.payment_account_id
            )
            salaries_payable = staff_posting._chart_account(session, SALARIES_PAYABLE_CODE)
            advances = staff_posting._chart_account(session, EMPLOYEE_ADVANCES_CODE)
            payable_cleared = amount_minor
            lines = staff_posting.build_try_salary_payment_lines(
                salaries_payable_id=salaries_payable.id,
                employee_advances_id=advances.id,
                payment_account_id=payment_gl.id,
                payable_cleared_kurus=payable_cleared,
                advance_applied_kurus=0,
                cash_paid_kurus=amount_minor,
            )
            return lines, -payable_cleared, None

        if payload.fx_money_account_id is None or try_cost is None:
            raise ValueError(
                "fx_money_account_id and try_cost_kurus required for FX payment correction"
            )
        salary_expense = staff_posting._chart_account(session, SALARY_EXPENSE_CODE)
        advances = staff_posting._chart_account(session, EMPLOYEE_ADVANCES_CODE)
        _, fx_gl = staff_posting._validate_fx_money_account(
            session, entity_id, payload.fx_money_account_id, employee.pay_currency
        )
        lines = staff_posting.build_fx_salary_payment_lines(
            salary_expense_id=salary_expense.id,
            employee_advances_id=advances.id,
            fx_gl_account_id=fx_gl.id,
            expense_try_kurus=try_cost,
            advance_applied_try_kurus=0,
            fx_paid_try_kurus=try_cost,
        )
        return lines, -amount_minor, try_cost

    raise CorrectionNotFoundError("staff movement type is not correctable")


def correct_staff_journal_entry_http(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: StaffJournalEntryCorrect,
) -> StaffJournalEntryCorrectOut:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        staff_row = _staff_row_for_correction(session, journal_entry_id, employee_id)
        lines, amount_minor, try_cost = _build_staff_correction_lines(
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
    original_id = result.original.id
    reversal_id = result.reversal.id
    from app.features.banking.statements import reset_statement_lines_for_voided_journal

    with entity_context(session, entity_id):
        reset_statement_lines_for_voided_journal(session, journal_entry_id)
        session.commit()
    return SubledgerVoidOut(
        original_journal_entry_id=original_id,
        reversal_journal_entry_id=reversal_id,
    )
