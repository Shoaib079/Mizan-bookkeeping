"""Account transfer HTTP routes — manual own-account transfers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.banking.posting import InvalidTransferError
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard
from app.features.banking import transfers as transfer_service
from app.features.banking.schema import AccountTransferCreate, AccountTransferRead

router = APIRouter(prefix="/entities/{entity_id}/banking/transfers", tags=["banking"])


@router.post("", response_model=AccountTransferRead, status_code=201)
def create_account_transfer(
    entity_id: uuid.UUID,
    payload: AccountTransferCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> AccountTransferRead:
    try:
        return transfer_service.create_account_transfer(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidTransferError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("", response_model=list[AccountTransferRead])
def list_account_transfers(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    money_account_id: uuid.UUID | None = Query(default=None),
) -> list[AccountTransferRead]:
    try:
        return transfer_service.list_account_transfers(
            session, entity_id, money_account_id=money_account_id
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
