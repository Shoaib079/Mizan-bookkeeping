"""Invoice draft HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.core.listing import ListParams, list_params_dependency, paginated_list
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard, resolve_actor_id
from app.features.auth.models import User
from app.features.invoices import service
from app.features.invoices.models import InvoiceDraftStatus, InvoiceKind
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
from app.features.invoices.schema import (
    DeliveryCommissionCorrect,
    DeliveryCommissionCorrectOut,
    DeliveryCommissionVoid,
    DeliveryCommissionVoidOut,
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
        # Says what became of the file already uploaded. "Duplicate invoice
        # document for this entity" left someone re-uploading, wondering
        # whether the first one had gone through — which is exactly what
        # auto-post makes hardest to tell.
        already_posted = (
            service.InvoiceDraftStatus(exc.existing.status)
            is service.InvoiceDraftStatus.POSTED
        )
        raise HTTPException(
            status_code=409,
            detail={
                "message": (
                    "This invoice is already posted to the ledger."
                    if already_posted
                    else "This file has already been uploaded — it is waiting in Review."
                ),
                "existing_draft_id": str(exc.existing.id),
                "existing_status": exc.existing.status,
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/drafts", response_model=InvoiceDraftListOut)
def list_invoice_drafts(
    entity_id: uuid.UUID,
    status: InvoiceDraftStatus | None = Query(default=None),
    invoice_kind: InvoiceKind | None = Query(default=None),
    delivery_platform_id: uuid.UUID | None = Query(default=None),
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
            invoice_kind=invoice_kind,
            delivery_platform_id=delivery_platform_id,
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


@router.get("/drafts/{draft_id}/document", response_model=None)
def get_invoice_draft_document(
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
):
    try:
        document = service.get_invoice_draft_document(
            session, entity_id, draft_id
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    local_path, content, media_type = document.as_file_response_args()
    if local_path is not None:
        return FileResponse(local_path, media_type=media_type)
    assert content is not None
    return Response(content=content, media_type=media_type)


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


@router.post(
    "/delivery-commission/{journal_entry_id}/correct",
    response_model=DeliveryCommissionCorrectOut,
)
def correct_delivery_commission(
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: DeliveryCommissionCorrect,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> DeliveryCommissionCorrectOut:
    """Correct a posted delivery commission invoice.

    Lives with the invoices rather than under `/delivery`: a commission
    arrives as an e-Fatura and is reviewed with the other invoices. The
    settlement screens reconcile the money, and never touch the document.
    """
    from app.core.ledger.correction import (
        CorrectionNotFoundError,
        correct_delivery_commission_invoice,
    )

    actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        result = correct_delivery_commission_invoice(
            session,
            entity_id,
            journal_entry_id,
            invoice_date=payload.invoice_date,
            description=payload.description,
            actor_id=actor_id,
            expense_account_id=payload.expense_account_id,
            net_kurus=payload.net_kurus,
            gross_kurus=payload.gross_kurus,
            vat_breakdown=[line.model_dump() for line in payload.vat_breakdown],
            reason=payload.reason,
            void_date=payload.void_date,
            period_unlock_reason=payload.period_unlock_reason,
        )
    except CorrectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (InvalidAccountError, PostingError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return DeliveryCommissionCorrectOut(
        original_journal_entry_id=result.original.id,
        reversal_journal_entry_id=result.reversal.id,
        corrected_journal_entry_id=result.corrected.id,
    )


@router.post(
    "/delivery-commission/{journal_entry_id}/void",
    response_model=DeliveryCommissionVoidOut,
)
def void_delivery_commission(
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: DeliveryCommissionVoid,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> DeliveryCommissionVoidOut:
    from app.core.ledger.correction import (
        CorrectionNotFoundError,
        void_delivery_commission_invoice,
    )

    actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        result = void_delivery_commission_invoice(
            session,
            entity_id,
            journal_entry_id,
            actor_id=actor_id,
            reason=payload.reason,
            void_date=payload.void_date,
            period_unlock_reason=payload.period_unlock_reason,
        )
    except CorrectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (PostingError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return DeliveryCommissionVoidOut(
        original_journal_entry_id=result.original.id,
        reversal_journal_entry_id=result.reversal.id,
    )
