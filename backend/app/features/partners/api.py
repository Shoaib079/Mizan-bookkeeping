"""Partner HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.listing import ListParams, list_params_dependency
from app.core.ledger.correction import CorrectionNotFoundError
from app.core.ledger.posting import InvalidAccountError, PostingError
from app.core.partners.ledger import OverpaymentError, OverRepaymentError, ZeroMovementError
from app.core.partners.posting import InvalidPartnerPostingError
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard, resolve_actor_id
from app.features.auth.models import User
from app.features.partners import service
from app.features.partners.schema import (
    ExpenseFrontedCreate,
    ExpenseFrontedResponse,
    PartnerCreate,
    PartnerLedgerRead,
    PartnerListOut,
    PartnerRead,
    PartnerUpdate,
    ReimbursementPaidCreate,
    ReimbursementPaidResponse,
    DrawingCreate,
    DrawingRepaymentCreate,
    DrawingResponse,
    DrawingRepaymentResponse,
    PartnerJournalEntryCorrect,
    PartnerJournalEntryCorrectOut,
    ProfitAllocationPost,
    ProfitAllocationPostOut,
    ProfitAllocationPreviewRead,
    ProfitAllocationPreviewRequest,
    ProfitAllocationVoid,
    ProfitAllocationVoidOut,
)
from app.core.partners.profit_allocation import OwnershipShareError

router = APIRouter(prefix="/entities/{entity_id}/partners", tags=["partners"])


@router.post("/profit-allocation/preview", response_model=ProfitAllocationPreviewRead)
def preview_profit_allocation(
    entity_id: uuid.UUID,
    payload: ProfitAllocationPreviewRequest,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> ProfitAllocationPreviewRead:
    try:
        return service.preview_profit_allocation(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (OwnershipShareError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/profit-allocation", response_model=ProfitAllocationPostOut, status_code=201)
def post_profit_allocation(
    entity_id: uuid.UUID,
    payload: ProfitAllocationPost,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> ProfitAllocationPostOut:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return service.post_profit_allocation(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (OwnershipShareError, ValueError, InvalidPartnerPostingError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/profit-allocation/{journal_entry_id}/void",
    response_model=ProfitAllocationVoidOut,
)
def void_profit_allocation(
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: ProfitAllocationVoid,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> ProfitAllocationVoidOut:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return service.void_profit_allocation(
            session, entity_id, journal_entry_id, payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CorrectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("", response_model=PartnerRead, status_code=201)
def create_partner(
    entity_id: uuid.UUID,
    payload: PartnerCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> PartnerRead:
    try:
        partner = service.create_partner(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return PartnerRead.model_validate(partner)


@router.get("", response_model=PartnerListOut)
def list_partners(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    include_inactive: bool = Query(default=False),
    q: str | None = Query(default=None, max_length=256),
    list_params: ListParams = Depends(list_params_dependency),
) -> PartnerListOut:
    try:
        partners, total = service.list_partners(
            session,
            entity_id,
            include_inactive=include_inactive,
            q=q,
            list_params=list_params,
        )
        share = service.ownership_share_summary(session, entity_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return PartnerListOut(
        items=[PartnerRead.model_validate(p) for p in partners],
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
        ownership_share=share,
    )


@router.get("/{partner_id}", response_model=PartnerRead)
def get_partner(
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
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
    _: None = Depends(operations_write_guard),
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
    _: None = Depends(member_read_guard),
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
    _guard: User | None = Depends(operations_write_guard),
) -> ExpenseFrontedResponse:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
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
    _guard: User | None = Depends(operations_write_guard),
) -> ReimbursementPaidResponse:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
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


@router.post(
    "/{partner_id}/drawings",
    response_model=DrawingResponse,
    status_code=201,
)
def post_partner_drawing(
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: DrawingCreate,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> DrawingResponse:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return service.record_drawing(session, entity_id, partner_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError, InvalidPartnerPostingError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/{partner_id}/drawing-repayments",
    response_model=DrawingRepaymentResponse,
    status_code=201,
)
def post_partner_drawing_repayment(
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: DrawingRepaymentCreate,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> DrawingRepaymentResponse:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return service.record_drawing_repayment(session, entity_id, partner_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError, InvalidPartnerPostingError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OverRepaymentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/{partner_id}/ledger/{journal_entry_id}/correct",
    response_model=PartnerJournalEntryCorrectOut,
)
def correct_partner_journal_entry(
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: PartnerJournalEntryCorrect,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> PartnerJournalEntryCorrectOut:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return service.correct_partner_journal_entry_http(
            session, entity_id, partner_id, journal_entry_id, payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CorrectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError, InvalidPartnerPostingError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
