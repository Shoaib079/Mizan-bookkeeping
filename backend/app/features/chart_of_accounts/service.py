"""Chart of accounts service — entity-scoped reads/writes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import (
    ChartAlreadySeededError,
    list_accounts,
    seed_default_chart,
)
from app.core.listing import ListParams
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.entities import service as entity_service

__all__ = [
    "ChartAlreadySeededError",
    "list_accounts_for_entity",
    "provision_entity_baseline",
    "seed_chart_for_entity",
]


def provision_entity_baseline(
    session: Session, entity_id: uuid.UUID, *, commit: bool = True
) -> None:
    """Seed default chart + cash drawer for a new entity — idempotent, single transaction."""
    try:
        seed_default_chart(session, entity_id, commit=False)
    except ChartAlreadySeededError:
        pass
    banking_service.ensure_default_cash_drawer(session, entity_id, commit=False)
    if commit:
        session.commit()


def seed_chart_for_entity(session: Session, entity_id: uuid.UUID) -> list[Account]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    accounts = seed_default_chart(session, entity_id, commit=False)
    chart_codes = [account.code for account in accounts]
    banking_service.ensure_default_cash_drawer(session, entity_id, commit=False)
    session.commit()
    with entity_context(session, entity_id):
        return list(
            session.scalars(
                select(Account)
                .where(Account.code.in_(chart_codes))
                .order_by(Account.code)
            )
        )


def list_accounts_for_entity(
    session: Session,
    entity_id: uuid.UUID,
    *,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[Account], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    return list_accounts(session, entity_id, q=q, list_params=list_params)
