"""Seed default chart of accounts for an entity (Decisions §1)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import DEFAULT_CHART
from app.core.chart_of_accounts.models import Account
from app.db.session import entity_context


class ChartAlreadySeededError(ValueError):
    """Entity already has a chart of accounts."""


def seed_default_chart(session: Session, entity_id: uuid.UUID) -> list[Account]:
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
        session.commit()
        for account in accounts:
            session.refresh(account)
        return accounts


def list_accounts(session: Session, entity_id: uuid.UUID) -> list[Account]:
    with entity_context(session, entity_id):
        return list(
            session.scalars(select(Account).order_by(Account.code))
        )


def get_account_by_code(
    session: Session, entity_id: uuid.UUID, code: str
) -> Account | None:
    with entity_context(session, entity_id):
        return session.scalar(select(Account).where(Account.code == code))
