"""Account transfer service — manual transfers and listing (Decisions §12)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.banking.posting import post_account_transfer
from app.core.listing import (
    ListParams,
    amount_range_filters,
    date_range_filters,
    fetch_paginated,
    text_search_filter,
)
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
    from_date: date | None = None,
    to_date: date | None = None,
    min_amount: int | None = None,
    max_amount: int | None = None,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[AccountTransferRead], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if money_account_id is not None:
            filters.append(
                or_(
                    AccountTransfer.from_money_account_id == money_account_id,
                    AccountTransfer.to_money_account_id == money_account_id,
                )
            )
        filters.extend(
            date_range_filters(
                AccountTransfer.transfer_date, from_date=from_date, to_date=to_date
            )
        )
        filters.extend(
            amount_range_filters(
                AccountTransfer.amount_kurus,
                min_amount=min_amount,
                max_amount=max_amount,
            )
        )
        search = text_search_filter(q, AccountTransfer.description)
        if search is not None:
            filters.append(search)
        stmt = (
            select(AccountTransfer)
            .where(*filters)
            .order_by(
                AccountTransfer.transfer_date.desc(),
                AccountTransfer.created_at.desc(),
            )
        )
        transfers, total = fetch_paginated(session, stmt, params)
        return [_to_read(transfer) for transfer in transfers], total
