"""Group sales HTTP routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.listing import ListParams, PaginatedListOut, list_params_dependency, paginated_list
from app.core.receivables.ledger import OverpaymentError
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard, resolve_actor_id
from app.features.auth.models import User
from app.features.group_sales import service
from app.features.group_sales.schema import (
    GroupMenuCreate,
    GroupMenuLineInput,
    GroupMenuLineRead,
    GroupMenuRead,
    GroupMenuUpdate,
    GroupSaleCorrect,
    GroupSaleCreate,
    GroupSaleDiscountCreate,
    GroupSalePostResponse,
    GroupSaleRead,
    GroupSaleVoid,
)
from app.features.group_sales.service import GroupSaleError, GroupSaleHasPaymentsError
from app.core.receivables import ledger as receivables_ledger

router = APIRouter(prefix="/entities/{entity_id}", tags=["group-sales"])


def _menu_read(menu, *, with_lines: bool) -> GroupMenuRead:
    """Serialise a menu, joining each line to its dish.

    Built field by field rather than `model_validate(menu)`. Validating the
    ORM object walks into `menu.lines` and tries to make a `GroupMenuLineRead`
    out of each row — which has no `dish_name`, `dish_description` or
    `dish_description_tr`, because those live on the dish it points at. That
    produced exactly three validation errors per line.

    The dish is read through the relationship, which is the point of
    referencing dishes: correcting a spelling in one place fixes every menu.
    """
    lines = [
        GroupMenuLineRead(
            id=line.id,
            dish_id=line.dish_id,
            dish_name=line.dish.name,
            dish_description=line.dish.description,
            dish_description_tr=line.dish.description_tr,
            sort_order=line.sort_order,
            note=line.note,
        )
        for line in menu.lines
    ]
    return GroupMenuRead(
        id=menu.id,
        name=menu.name,
        description=menu.description,
        price_minor=menu.price_minor,
        currency=menu.currency,
        surcharge_minor=menu.surcharge_minor,
        surcharge_label=menu.surcharge_label,
        price_excludes_vat=menu.price_excludes_vat,
        category=menu.category,
        sort_order=menu.sort_order,
        is_active=menu.is_active,
        created_at=menu.created_at,
        # The list sends a count, not the dishes: eleven menus of ten lines
        # each is a lot of payload for a table that shows a number.
        lines=lines if with_lines else [],
        line_count=len(lines),
    )


@router.post("/group-menus", response_model=GroupMenuRead, status_code=201)
def create_group_menu(
    entity_id: uuid.UUID,
    payload: GroupMenuCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> GroupMenuRead:
    try:
        menu = service.create_group_menu(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _menu_read(menu, with_lines=True)


@router.get("/group-menus", response_model=PaginatedListOut[GroupMenuRead])
def list_group_menus(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    include_inactive: bool = Query(default=False),
    q: str | None = Query(default=None, max_length=256),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[GroupMenuRead]:
    try:
        menus, total = service.list_group_menus(
            session,
            entity_id,
            include_inactive=include_inactive,
            q=q,
            list_params=list_params,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return paginated_list(
        [_menu_read(m, with_lines=False) for m in menus],
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )


@router.get("/group-menus/export.pdf", response_model=None)
def export_menu_pdf(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
):
    """The menu document, as a PDF and only as a PDF.

    Every other download in this app offers Excel or PDF. This one does not,
    on purpose: an agency that receives a `.docx` can change a price and pass
    it on, and nothing in the file records that it was altered. A spreadsheet
    is worse — the numbers are already sitting in editable cells.

    **This route must stay above `/group-menus/{menu_id}`.** Registered after
    it, FastAPI matches `export.pdf` as a menu id, fails to parse it as a UUID
    and returns 422 — a broken download with an error message about the wrong
    thing entirely. `test_menu_pdf.py` pins the behaviour, not the ordering,
    so moving this breaks a test rather than a customer's menu.
    """
    from app.features.entities import service as entity_service
    from app.features.menu.document_service import build_menu_document
    from app.features.menu.menu_pdf import build_menu_pdf, menu_pdf_filename
    from app.features.reports import pdf_export

    entity = entity_service.get_entity(session, entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    document = build_menu_document(session, entity_id)
    if document.is_empty():
        raise HTTPException(
            status_code=422,
            detail="This restaurant has no active menus to print yet.",
        )
    return pdf_export.pdf_response(
        build_menu_pdf(document), menu_pdf_filename(entity.name)
    )


@router.patch("/group-menus/{menu_id}", response_model=GroupMenuRead)
def update_group_menu(
    entity_id: uuid.UUID,
    menu_id: uuid.UUID,
    payload: GroupMenuUpdate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> GroupMenuRead:
    try:
        menu = service.update_group_menu(session, entity_id, menu_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _menu_read(menu, with_lines=True)


@router.get("/group-menus/{menu_id}", response_model=GroupMenuRead)
def get_group_menu(
    entity_id: uuid.UUID,
    menu_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> GroupMenuRead:
    try:
        menu = service.get_group_menu(session, entity_id, menu_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _menu_read(menu, with_lines=True)


@router.put("/group-menus/{menu_id}/lines", response_model=GroupMenuRead)
def replace_group_menu_lines(
    entity_id: uuid.UUID,
    menu_id: uuid.UUID,
    payload: list[GroupMenuLineInput],
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> GroupMenuRead:
    """Set the whole dish list at once, in the order given.

    PUT rather than POST: the body is the complete list, and sending it twice
    leaves the same menu.
    """
    try:
        menu = service.replace_group_menu_lines(session, entity_id, menu_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.MenuLineError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _menu_read(menu, with_lines=True)


@router.post("/group-sales", response_model=GroupSalePostResponse, status_code=201)
def create_group_sale(
    entity_id: uuid.UUID,
    payload: GroupSaleCreate,
    session: Session = Depends(get_session),
    actor: User = Depends(operations_write_guard),
) -> GroupSalePostResponse:
    payload = payload.model_copy(update={"actor_id": resolve_actor_id(actor, payload.actor_id)})
    try:
        sale = service.post_group_sale(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except GroupSaleError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _post_response(session, entity_id, sale)


@router.get("/group-sales", response_model=PaginatedListOut[GroupSaleRead])
def list_group_sales(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    customer_id: uuid.UUID | None = Query(default=None),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[GroupSaleRead]:
    try:
        sales, total = service.list_group_sales(
            session,
            entity_id,
            customer_id=customer_id,
            list_params=list_params,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    from app.db.session import entity_context

    with entity_context(session, entity_id):
        items = [service.to_group_sale_read(session, s) for s in sales]
    return paginated_list(items, total=total, limit=list_params.limit, offset=list_params.offset)


@router.get("/group-sales/{group_sale_id}", response_model=GroupSaleRead)
def get_group_sale(
    entity_id: uuid.UUID,
    group_sale_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> GroupSaleRead:
    try:
        sale = service.get_group_sale(session, entity_id, group_sale_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    from app.db.session import entity_context

    with entity_context(session, entity_id):
        return service.to_group_sale_read(session, sale)


@router.post("/group-sales/{group_sale_id}/void", response_model=GroupSaleRead)
def void_group_sale(
    entity_id: uuid.UUID,
    group_sale_id: uuid.UUID,
    payload: GroupSaleVoid,
    session: Session = Depends(get_session),
    actor: User = Depends(operations_write_guard),
) -> GroupSaleRead:
    actor_id = resolve_actor_id(actor, payload.actor_id)
    try:
        sale = service.void_group_sale(
            session,
            entity_id,
            group_sale_id,
            actor_id=actor_id,
            reason=payload.reason,
            void_date=payload.void_date,
            period_unlock_reason=payload.period_unlock_reason,
        )
    except GroupSaleHasPaymentsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (LookupError, GroupSaleError) as exc:
        raise HTTPException(status_code=404 if isinstance(exc, LookupError) else 422, detail=str(exc)) from exc
    from app.db.session import entity_context

    with entity_context(session, entity_id):
        return service.to_group_sale_read(session, sale)


@router.post("/group-sales/{group_sale_id}/discount", response_model=GroupSaleRead)
def discount_group_sale(
    entity_id: uuid.UUID,
    group_sale_id: uuid.UUID,
    payload: GroupSaleDiscountCreate,
    session: Session = Depends(get_session),
    actor: User = Depends(operations_write_guard),
) -> GroupSaleRead:
    actor_id = resolve_actor_id(actor, payload.actor_id)
    try:
        sale = service.post_group_sale_discount(
            session,
            entity_id,
            group_sale_id,
            discount_kurus=payload.discount_kurus,
            discount_native=payload.discount_native,
            description=payload.description,
            actor_id=actor_id,
            discount_date=payload.discount_date,
        )
    except (LookupError, GroupSaleError) as exc:
        raise HTTPException(
            status_code=404 if isinstance(exc, LookupError) else 422, detail=str(exc)
        ) from exc
    from app.db.session import entity_context

    with entity_context(session, entity_id):
        return service.to_group_sale_read(session, sale)


@router.post("/group-sales/{group_sale_id}/correct", response_model=GroupSalePostResponse)
def correct_group_sale(
    entity_id: uuid.UUID,
    group_sale_id: uuid.UUID,
    payload: GroupSaleCorrect,
    session: Session = Depends(get_session),
    actor: User = Depends(operations_write_guard),
) -> GroupSalePostResponse:
    body = GroupSaleCreate.model_validate(payload.model_dump())
    body = body.model_copy(update={"actor_id": resolve_actor_id(actor, payload.actor_id)})
    try:
        sale = service.correct_group_sale(
            session,
            entity_id,
            group_sale_id,
            body,
            reason=payload.reason,
            void_date=payload.void_date,
            period_unlock_reason=payload.period_unlock_reason,
        )
    except GroupSaleHasPaymentsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (LookupError, GroupSaleError, ValueError) as exc:
        status = 404 if isinstance(exc, LookupError) else 422
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    return _post_response(session, entity_id, sale)


def _post_response(session, entity_id, sale) -> GroupSalePostResponse:
    from app.db.session import entity_context
    from app.features.group_sales.fx_receivable import native_balance_for_currency

    with entity_context(session, entity_id):
        read = service.to_group_sale_read(session, sale)
        balance_kurus = receivables_ledger.current_balance_kurus(
            session, entity_id, sale.customer_id
        )
        balance_forex = None
        balance_currency = sale.forex_currency
        if balance_currency:
            balance_forex = native_balance_for_currency(
                session, sale.customer_id, balance_currency
            )
    return GroupSalePostResponse(
        group_sale=read,
        balance_kurus=balance_kurus,
        balance_forex_minor=balance_forex,
        balance_forex_currency=balance_currency,
    )
