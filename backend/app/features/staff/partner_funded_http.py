"""HTTP helpers for partner-funded staff salary — keep staff service thin."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.core.duplicate_guard import (
    ensure_not_duplicate,
    find_duplicate_staff_movement,
)
from app.core.staff.partner_funded_payment import (
    InvalidPartnerFundedSalaryError,
    post_partner_funded_period_salary,
    void_partner_funded_salary,
)
from app.core.staff.types import StaffMovementType
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.ledger.schema import SubledgerVoidOut
from app.features.staff.partner_funded_schema import (
    PartnerFundedSalaryCreate,
    PartnerFundedSalaryResponse,
)
from app.features.staff import service as staff_service


def record_partner_funded_payment(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: PartnerFundedSalaryCreate,
) -> PartnerFundedSalaryResponse:
    with entity_context(session, entity_id):
        require_entity_context()
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

    result = post_partner_funded_period_salary(
        session,
        entity_id,
        employee_id,
        payload.partner_id,
        payment_date=payload.payment_date,
        amount_minor=payload.amount_minor,
        period_year=payload.period_year,
        period_month=payload.period_month,
        period_salary_minor=payload.period_salary_minor,
        description=payload.description,
        actor_id=payload.actor_id,
        extra_days=payload.extra_days,
        per_day_minor=payload.per_day_minor,
    )
    return PartnerFundedSalaryResponse(
        journal_entry_id=result.journal_entry.id,
        staff_ledger_entry=staff_service._staff_entry_read(
            session, result.staff_ledger_entry, entity_id=entity_id
        ),
        partner_ledger_entry_id=result.partner_ledger_entry.id,
        partner_id=result.partner_ledger_entry.partner_id,
        balance_minor=result.balance_minor,
        partner_balance_kurus=result.partner_balance_kurus,
        advance_applied_minor=result.advance_applied_minor,
    )


def void_partner_funded_payment_http(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidOut:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    result = void_partner_funded_salary(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
    )
    return SubledgerVoidOut(
        original_journal_entry_id=result.original.id,
        reversal_journal_entry_id=result.reversal.id,
    )
