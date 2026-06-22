"""Receivables HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

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
) -> ReceivablesSummaryRead:
    try:
        total, rows = service.list_receivables(session, entity_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return ReceivablesSummaryRead(
        total_receivables_kurus=total,
        customers=[
            CustomerReceivableBalanceRead(
                customer_id=customer.id,
                customer_name=customer.name,
                identifier=customer.identifier,
                balance_kurus=balance,
            )
            for customer, balance in rows
        ],
    )
