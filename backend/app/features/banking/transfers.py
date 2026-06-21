"""Account transfer service — manual transfers and listing (Decisions §12)."""

from __future__ import annotations

import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.banking.posting import post_account_transfer
from app.db.session import entity_context, require_entity_context
from app.features.banking.schema import AccountTransferCreate, AccountTransferRead
from app.features.banking.transfer_models import AccountTransfer
from app.features.entities import service as entity_service


def _to_read(transfer: AccountTransfer) -> AccountTransferRead:
    return AccountTransferRead(
        id=transfer.id,
        entity_id=transfer.entity_id,
        from_money_account_id=transfer.from_money_account_id,
        to_money_account_id=transfer.to_money_account_id,
        amount_kurus=transfer.amount_kurus,
        transfer_date=transfer.transfer_date,
        description=transfer.description,
        actor_id=transfer.actor_id,
        journal_entry_id=transfer.journal_entry_id,
        from_statement_line_id=transfer.from_statement_line_id,
        to_statement_line_id=transfer.to_statement_line_id,
        created_at=transfer.created_at,
    )


def create_account_transfer(
    session: Session,
    entity_id: uuid.UUID,
    payload: AccountTransferCreate,
) -> AccountTransferRead:
    result = post_account_transfer(
        session,
        entity_id,
        from_money_account_id=payload.from_money_account_id,
        to_money_account_id=payload.to_money_account_id,
        transfer_date=payload.transfer_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
    )
    return _to_read(result.account_transfer)


def list_account_transfers(
    session: Session,
    entity_id: uuid.UUID,
    *,
    money_account_id: uuid.UUID | None = None,
) -> list[AccountTransferRead]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        query = select(AccountTransfer).order_by(
            AccountTransfer.transfer_date.desc(),
            AccountTransfer.created_at.desc(),
        )
        if money_account_id is not None:
            query = query.where(
                or_(
                    AccountTransfer.from_money_account_id == money_account_id,
                    AccountTransfer.to_money_account_id == money_account_id,
                )
            )
        transfers = session.scalars(query).all()
        return [_to_read(transfer) for transfer in transfers]
