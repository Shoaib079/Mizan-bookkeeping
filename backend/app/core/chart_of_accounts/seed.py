"""Seed default chart of accounts for an entity (Decisions §1)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import DEFAULT_CHART
from app.core.chart_of_accounts.models import Account
from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.db.session import entity_context


class ChartAlreadySeededError(ValueError):
    """Entity already has a chart of accounts."""


def seed_default_chart(
    session: Session, entity_id: uuid.UUID, *, commit: bool = True
) -> list[Account]:
    """Insert default restaurant chart for one entity — idempotent guard."""
    with entity_context(session, entity_id):
        count = session.scalar(select(func.count()).select_from(Account)) or 0
        if count > 0:
            raise ChartAlreadySeededError(f"entity {entity_id} already has {count} accounts")

        accounts = [
            Account(
                code=template.code,
                name_en=template.name_en,
                name_tr=template.name_tr,
                account_type=template.account_type,
                normal_balance=template.normal_balance,
                accepts_opening_balance=template.accepts_opening_balance,
            )
            for template in DEFAULT_CHART
        ]
        session.add_all(accounts)
        if commit:
            session.commit()
            for account in accounts:
                session.refresh(account)
        else:
            session.flush()
        return accounts


def list_accounts(
    session: Session,
    entity_id: uuid.UUID,
    *,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[Account], int]:
    params = list_params or ListParams()
    with entity_context(session, entity_id):
        filters = []
        search = text_search_filter(q, Account.code, Account.name_en, Account.name_tr)
        if search is not None:
            filters.append(search)
        stmt = select(Account).where(*filters).order_by(Account.code)
        return fetch_paginated(session, stmt, params)


def get_account_by_code(
    session: Session, entity_id: uuid.UUID, code: str
) -> Account | None:
    with entity_context(session, entity_id):
        return session.scalar(select(Account).where(Account.code == code))
