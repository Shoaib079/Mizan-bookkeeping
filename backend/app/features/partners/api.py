"""Partner HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.ledger.posting import InvalidAccountError, PostingError
from app.core.partners.ledger import OverpaymentError, ZeroMovementError
from app.core.partners.posting import InvalidPartnerPostingError
from app.db.session import get_session
from app.features.partners import service
from app.features.partners.schema import (
    ExpenseFrontedCreate,
    ExpenseFrontedResponse,
    PartnerCreate,
    PartnerLedgerRead,
    PartnerRead,
    PartnerUpdate,
    ReimbursementPaidCreate,
    ReimbursementPaidResponse,
)

router = APIRouter(prefix="/entities/{entity_id}/partners", tags=["partners"])


@router.post("", response_model=PartnerRead, status_code=201)
def create_partner(
    entity_id: uuid.UUID,
    payload: PartnerCreate,
    session: Session = Depends(get_session),
) -> PartnerRead:
    try:
        partner = service.create_partner(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return PartnerRead.model_validate(partner)


@router.get("", response_model=list[PartnerRead])
def list_partners(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    include_inactive: bool = Query(default=False),
) -> list[PartnerRead]:
    try:
        partners = service.list_partners(
            session, entity_id, include_inactive=include_inactive
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return [PartnerRead.model_validate(p) for p in partners]


@router.get("/{partner_id}", response_model=PartnerRead)
def get_partner(
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> PartnerRead:
    try:
        partner = service.get_partner(session, entity_id, partner_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return PartnerRead.model_validate(partner)


@router.patch("/{partner_id}", response_model=PartnerRead)
def update_partner(
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: PartnerUpdate,
    session: Session = Depends(get_session),
) -> PartnerRead:
    try:
        partner = service.update_partner(session, entity_id, partner_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return PartnerRead.model_validate(partner)


@router.get("/{partner_id}/ledger", response_model=PartnerLedgerRead)
def get_partner_ledger(
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> PartnerLedgerRead:
    try:
        return service.get_partner_ledger(session, entity_id, partner_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/{partner_id}/expenses-fronted",
    response_model=ExpenseFrontedResponse,
    status_code=201,
)
def post_expense_fronted(
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: ExpenseFrontedCreate,
    session: Session = Depends(get_session),
) -> ExpenseFrontedResponse:
    try:
        return service.record_expense_fronted(session, entity_id, partner_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError, InvalidPartnerPostingError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/{partner_id}/reimbursements",
    response_model=ReimbursementPaidResponse,
    status_code=201,
)
def post_reimbursement_paid(
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: ReimbursementPaidCreate,
    session: Session = Depends(get_session),
) -> ReimbursementPaidResponse:
    try:
        return service.record_reimbursement_paid(session, entity_id, partner_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError, InvalidPartnerPostingError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OverpaymentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
