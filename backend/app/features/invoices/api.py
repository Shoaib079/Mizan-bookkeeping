"""Invoice draft HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.listing import ListParams, list_params_dependency, paginated_list
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard, resolve_actor_id
from app.features.auth.models import User
from app.features.invoices import service
from app.features.invoices.models import InvoiceDraftStatus
from app.core.invoices.posting import DraftPostError
from app.core.ledger.errors import PostingError
from app.core.ledger.posting import InvalidAccountError
from app.features.invoices.schema import (
    ConfirmAndPostInvoiceDraftRequest,
    ConfirmDraftRequest,
    InvoiceDraftListOut,
    InvoiceDraftOut,
    LinkDeliveryPlatformRequest,
    LinkSupplierRequest,
    PostInvoiceDraftOut,
    PostInvoiceDraftRequest,
    RejectDraftRequest,
    SetInvoiceKindRequest,
    UnconfirmDraftRequest,
)
from app.features.delivery.settings import DeliveryNotEnabledError

router = APIRouter(prefix="/entities/{entity_id}/invoices", tags=["invoices"])


@router.post("/efatura/draft", response_model=InvoiceDraftOut, status_code=201)
async def upload_efatura_draft(
    entity_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> InvoiceDraftOut:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        return service.create_efatura_draft_from_upload(
            session,
            entity_id,
            content,
            filename=file.filename,
            content_type=file.content_type,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.DuplicateInvoiceDraftError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Duplicate invoice document for this entity",
                "existing_draft_id": str(exc.existing.id),
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/drafts", response_model=InvoiceDraftListOut)
def list_invoice_drafts(
    entity_id: uuid.UUID,
    status: InvoiceDraftStatus | None = Query(default=None),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=256),
    min_amount: int | None = Query(default=None),
    max_amount: int | None = Query(default=None),
    supplier_id: uuid.UUID | None = Query(default=None),
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    list_params: ListParams = Depends(list_params_dependency),
) -> InvoiceDraftListOut:
    try:
        items, total = service.list_invoice_drafts(
            session,
            entity_id,
            status=status,
            from_date=from_date,
            to_date=to_date,
            q=q,
            min_amount=min_amount,
            max_amount=max_amount,
            supplier_id=supplier_id,
            list_params=list_params,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return paginated_list(
        items,
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )


@router.get("/drafts/{draft_id}", response_model=InvoiceDraftOut)
def get_invoice_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> InvoiceDraftOut:
    try:
        return service.get_invoice_draft(session, entity_id, draft_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/drafts/{draft_id}/document")
def get_invoice_draft_document(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> FileResponse:
    try:
        path, media_type = service.get_invoice_draft_document_path(
            session, entity_id, draft_id
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(path, media_type=media_type)


@router.post("/drafts/{draft_id}/link-supplier", response_model=InvoiceDraftOut)
def link_supplier_to_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    payload: LinkSupplierRequest,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> InvoiceDraftOut:
    try:
        return service.link_supplier_to_draft(
            session,
            entity_id,
            draft_id,
            supplier_id=payload.supplier_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.SupplierLinkError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except service.DraftNotLinkableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/drafts/{draft_id}/unlink-supplier", response_model=InvoiceDraftOut)
def unlink_supplier_from_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> InvoiceDraftOut:
    try:
        return service.unlink_supplier_from_draft(session, entity_id, draft_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.DraftNotLinkableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/drafts/{draft_id}/link-delivery-platform", response_model=InvoiceDraftOut)
def link_delivery_platform_to_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    payload: LinkDeliveryPlatformRequest,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> InvoiceDraftOut:
    try:
        return service.link_delivery_platform_to_draft(
            session,
            entity_id,
            draft_id,
            delivery_platform_id=payload.delivery_platform_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DeliveryNotEnabledError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except service.DeliveryPlatformLinkError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except service.DraftNotLinkableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/drafts/{draft_id}/unlink-delivery-platform", response_model=InvoiceDraftOut)
def unlink_delivery_platform_from_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> InvoiceDraftOut:
    try:
        return service.unlink_delivery_platform_from_draft(session, entity_id, draft_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.DraftNotLinkableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/drafts/{draft_id}/confirm", response_model=InvoiceDraftOut)
def confirm_invoice_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    payload: ConfirmDraftRequest,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> InvoiceDraftOut:
    actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return service.confirm_invoice_draft(
            session, entity_id, draft_id, actor_id=actor_id
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.DraftConfirmError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/drafts/{draft_id}/unconfirm", response_model=InvoiceDraftOut)
def unconfirm_invoice_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    payload: UnconfirmDraftRequest,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> InvoiceDraftOut:
    actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return service.unconfirm_invoice_draft(
            session,
            entity_id,
            draft_id,
            actor_id=actor_id,
            reason=payload.reason,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.DraftConfirmError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/drafts/{draft_id}/set-kind", response_model=InvoiceDraftOut)
def set_invoice_draft_kind(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    payload: SetInvoiceKindRequest,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> InvoiceDraftOut:
    try:
        return service.set_invoice_draft_kind(
            session,
            entity_id,
            draft_id,
            invoice_kind=payload.invoice_kind,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DeliveryNotEnabledError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except service.DraftNotLinkableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/drafts/{draft_id}/reject", status_code=204)
def reject_invoice_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    payload: RejectDraftRequest,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> None:
    try:
        service.reject_invoice_draft(
            session, entity_id, draft_id, reason=payload.reason
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.DraftConfirmError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except service.DraftImmutableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/drafts/{draft_id}/confirm-and-post", response_model=PostInvoiceDraftOut)
def confirm_and_post_invoice_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    payload: ConfirmAndPostInvoiceDraftRequest,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> PostInvoiceDraftOut:
    actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return service.confirm_and_post_supplier_invoice_draft(
            session,
            entity_id,
            draft_id,
            expense_account_id=payload.expense_account_id,
            actor_id=actor_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.DraftConfirmError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DraftPostError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/drafts/{draft_id}/post", response_model=PostInvoiceDraftOut)
def post_invoice_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    payload: PostInvoiceDraftRequest,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> PostInvoiceDraftOut:
    actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return service.post_invoice_draft(
            session,
            entity_id,
            draft_id,
            expense_account_id=payload.expense_account_id,
            actor_id=actor_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DraftPostError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DeliveryNotEnabledError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
