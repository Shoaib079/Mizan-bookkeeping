"""Receivables HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.listing import ListParams, list_params_dependency

from app.core.auth.deps import member_read_guard
from app.db.session import get_session
from app.features.receivables import service
from app.features.receivables.schema import (
    CustomerReceivableBalanceRead,
    ReceivablesSummaryRead,
)

router = APIRouter(prefix="/entities/{entity_id}", tags=["receivables"])


@router.get("/receivables", response_model=ReceivablesSummaryRead)
def list_receivables(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    q: str | None = Query(default=None, max_length=256),
    list_params: ListParams = Depends(list_params_dependency),
) -> ReceivablesSummaryRead:
    try:
        total_receivables, rows, total = service.list_receivables(
            session, entity_id, q=q, list_params=list_params
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return ReceivablesSummaryRead(
        total_receivables_kurus=total_receivables,
        customers=[
            CustomerReceivableBalanceRead(
                customer_id=customer.id,
                customer_name=customer.name,
                identifier=customer.identifier,
                balance_kurus=balance,
            )
            for customer, balance in rows
        ],
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )
