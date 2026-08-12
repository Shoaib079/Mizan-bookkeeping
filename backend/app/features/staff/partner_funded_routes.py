"""Partner-funded salary HTTP routes — separate module so staff/api.py stays thin."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth.deps import operations_write_guard, resolve_actor_id
from app.core.ledger.correction import CorrectionNotFoundError
from app.core.ledger.posting import InvalidAccountError, PostingError
from app.core.staff.ledger import ZeroMovementError
from app.core.staff.partner_funded_payment import InvalidPartnerFundedSalaryError
from app.db.session import get_session
from app.features.auth.models import User
from app.features.ledger.schema import SubledgerVoidOut, VoidJournalEntryRequest
from app.features.staff import partner_funded_http
from app.features.staff.partner_funded_schema import (
    PartnerFundedSalaryCreate,
    PartnerFundedSalaryResponse,
)

router = APIRouter(prefix="/entities/{entity_id}/staff", tags=["staff"])


@router.post(
    "/employees/{employee_id}/partner-funded-payments",
    response_model=PartnerFundedSalaryResponse,
    status_code=201,
)
def post_partner_funded_salary(
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: PartnerFundedSalaryCreate,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> PartnerFundedSalaryResponse:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return partner_funded_http.record_partner_funded_payment(
            session, entity_id, employee_id, payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (
        ZeroMovementError,
        ValueError,
        InvalidPartnerFundedSalaryError,
    ) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/partner-funded-salary/{journal_entry_id}/void",
    response_model=SubledgerVoidOut,
)
def void_partner_funded_salary_route(
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: VoidJournalEntryRequest,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> SubledgerVoidOut:
    """One void for both staff and partner pages — never void one leg alone."""
    actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return partner_funded_http.void_partner_funded_payment_http(
            session,
            entity_id,
            journal_entry_id,
            actor_id=actor_id,
            reason=payload.reason,
            void_date=payload.void_date,
            period_unlock_reason=payload.period_unlock_reason,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CorrectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
