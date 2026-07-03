"""Account transfer HTTP routes — manual own-account transfers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.listing import ListParams, PaginatedListOut, list_params_dependency, paginated_list
from app.core.banking.posting import InvalidTransferError
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard, resolve_actor_id
from app.features.auth.models import User
from app.features.banking import transfers as transfer_service
from app.features.banking.schema import AccountTransferCreate, AccountTransferRead

router = APIRouter(prefix="/entities/{entity_id}/banking/transfers", tags=["banking"])


@router.post("", response_model=AccountTransferRead, status_code=201)
def create_account_transfer(
    entity_id: uuid.UUID,
    payload: AccountTransferCreate,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> AccountTransferRead:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return transfer_service.create_account_transfer(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidTransferError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("", response_model=PaginatedListOut[AccountTransferRead])
def list_account_transfers(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    money_account_id: uuid.UUID | None = Query(default=None),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=256),
    min_amount: int | None = Query(default=None),
    max_amount: int | None = Query(default=None),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[AccountTransferRead]:
    try:
        items, total = transfer_service.list_account_transfers(
            session,
            entity_id,
            money_account_id=money_account_id,
            from_date=from_date,
            to_date=to_date,
            q=q,
            min_amount=min_amount,
            max_amount=max_amount,
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
