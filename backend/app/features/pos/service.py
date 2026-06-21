"""POS settlement service — manual intake and listing (Decisions §13)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.pos.posting import post_pos_settlement
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.pos.models import PosSettlement
from app.features.pos.schema import PosSettlementCreate, PosSettlementRead


def _to_read(settlement: PosSettlement) -> PosSettlementRead:
    return PosSettlementRead(
        id=settlement.id,
        entity_id=settlement.entity_id,
        money_account_id=settlement.money_account_id,
        settlement_date=settlement.settlement_date,
        amount_kurus=settlement.amount_kurus,
        description=settlement.description,
        actor_id=settlement.actor_id,
        journal_entry_id=settlement.journal_entry_id,
        reference_type=settlement.reference_type,
        reference_id=settlement.reference_id,
        bank_statement_line_id=settlement.bank_statement_line_id,
        commission_kurus=settlement.commission_kurus,
        created_at=settlement.created_at,
    )


def create_pos_settlement(
    session: Session,
    entity_id: uuid.UUID,
    payload: PosSettlementCreate,
) -> PosSettlementRead:
    result = post_pos_settlement(
        session,
        entity_id,
        money_account_id=payload.money_account_id,
        settlement_date=payload.settlement_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
    )
    return _to_read(result.pos_settlement)


def list_pos_settlements(
    session: Session,
    entity_id: uuid.UUID,
    *,
    money_account_id: uuid.UUID | None = None,
) -> list[PosSettlementRead]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        query = select(PosSettlement).order_by(
            PosSettlement.settlement_date.desc(),
            PosSettlement.created_at.desc(),
        )
        if money_account_id is not None:
            query = query.where(PosSettlement.money_account_id == money_account_id)
        settlements = session.scalars(query).all()
        return [_to_read(settlement) for settlement in settlements]


def get_pos_settlement(
    session: Session,
    entity_id: uuid.UUID,
    settlement_id: uuid.UUID,
) -> PosSettlementRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        settlement = session.get(PosSettlement, settlement_id)
        if settlement is None:
            raise LookupError("POS settlement not found")
        return _to_read(settlement)
