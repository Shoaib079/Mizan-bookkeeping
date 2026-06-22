"""Invoice draft HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.adapters.ocr_ai.efatura import EfaturaPdfUnsupportedError
from app.db.session import get_session
from app.features.invoices import service
from app.features.invoices.models import InvoiceDraftStatus
from app.core.invoices.posting import DraftPostError
from app.core.ledger.posting import InvalidAccountError
from app.features.invoices.schema import (
    ConfirmDraftRequest,
    InvoiceDraftListOut,
    InvoiceDraftOut,
    LinkDeliveryReportRequest,
    LinkSupplierRequest,
    PostInvoiceDraftOut,
    PostInvoiceDraftRequest,
    RejectDraftRequest,
)
from app.features.delivery.settings import DeliveryNotEnabledError

router = APIRouter(prefix="/entities/{entity_id}/invoices", tags=["invoices"])


@router.post("/efatura/draft", response_model=InvoiceDraftOut, status_code=201)
async def upload_efatura_draft(
    entity_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
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
    except EfaturaPdfUnsupportedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/drafts", response_model=InvoiceDraftListOut)
def list_invoice_drafts(
    entity_id: uuid.UUID,
    status: InvoiceDraftStatus | None = Query(default=None),
    session: Session = Depends(get_session),
) -> InvoiceDraftListOut:
    try:
        items, total = service.list_invoice_drafts(session, entity_id, status=status)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return InvoiceDraftListOut(items=items, total=total)


@router.get("/drafts/{draft_id}", response_model=InvoiceDraftOut)
def get_invoice_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> InvoiceDraftOut:
    try:
        return service.get_invoice_draft(session, entity_id, draft_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/drafts/{draft_id}/link-supplier", response_model=InvoiceDraftOut)
def link_supplier_to_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    payload: LinkSupplierRequest,
    session: Session = Depends(get_session),
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
) -> InvoiceDraftOut:
    try:
        return service.unlink_supplier_from_draft(session, entity_id, draft_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.DraftNotLinkableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/drafts/{draft_id}/link-delivery-report", response_model=InvoiceDraftOut)
def link_delivery_report_to_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    payload: LinkDeliveryReportRequest,
    session: Session = Depends(get_session),
) -> InvoiceDraftOut:
    try:
        return service.link_delivery_report_to_draft(
            session,
            entity_id,
            draft_id,
            delivery_report_id=payload.delivery_report_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DeliveryNotEnabledError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except service.DeliveryReportLinkError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except service.DraftNotLinkableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/drafts/{draft_id}/unlink-delivery-report", response_model=InvoiceDraftOut)
def unlink_delivery_report_from_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> InvoiceDraftOut:
    try:
        return service.unlink_delivery_report_from_draft(session, entity_id, draft_id)
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
) -> InvoiceDraftOut:
    try:
        return service.confirm_invoice_draft(
            session, entity_id, draft_id, actor_id=payload.actor_id
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.DraftConfirmError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/drafts/{draft_id}/reject", response_model=InvoiceDraftOut)
def reject_invoice_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    payload: RejectDraftRequest,
    session: Session = Depends(get_session),
) -> InvoiceDraftOut:
    try:
        return service.reject_invoice_draft(
            session, entity_id, draft_id, reason=payload.reason
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.DraftConfirmError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except service.DraftImmutableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/drafts/{draft_id}/post", response_model=PostInvoiceDraftOut)
def post_invoice_draft(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    payload: PostInvoiceDraftRequest,
    session: Session = Depends(get_session),
) -> PostInvoiceDraftOut:
    try:
        return service.post_invoice_draft(
            session,
            entity_id,
            draft_id,
            expense_account_id=payload.expense_account_id,
            actor_id=payload.actor_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DraftPostError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
