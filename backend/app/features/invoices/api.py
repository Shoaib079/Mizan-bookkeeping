"""Invoice draft HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.adapters.ocr_ai.efatura import EfaturaPdfUnsupportedError
from app.db.session import get_session
from app.features.invoices import service
from app.features.invoices.schema import InvoiceDraftListOut, InvoiceDraftOut

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
    session: Session = Depends(get_session),
) -> InvoiceDraftListOut:
    try:
        items, total = service.list_invoice_drafts(session, entity_id)
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
