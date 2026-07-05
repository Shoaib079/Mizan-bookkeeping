"""Chart of accounts service — entity-scoped reads/writes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import (
    ChartAlreadySeededError,
    list_accounts,
    seed_default_chart,
)
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.listing import ListParams
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.chart_of_accounts.errors import (
    CustomExpenseCategoryLimitError,
    DuplicateExpenseCategoryNameError,
    EmptyExpenseCategoryNameError,
)
from app.features.entities import service as entity_service

__all__ = [
    "ChartAlreadySeededError",
    "CustomExpenseCategoryLimitError",
    "DuplicateExpenseCategoryNameError",
    "EmptyExpenseCategoryNameError",
    "create_custom_expense_account",
    "list_accounts_for_entity",
    "provision_entity_baseline",
    "seed_chart_for_entity",
]

CUSTOM_EXPENSE_CODE_MIN = 5900
CUSTOM_EXPENSE_CODE_MAX = 5999


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


def _next_custom_expense_code(session: Session, entity_id: uuid.UUID) -> str:
    with entity_context(session, entity_id):
        codes = session.scalars(
            select(Account.code).where(
                Account.is_active.is_(True),
                Account.account_type == AccountType.EXPENSE,
            )
        ).all()
    used = {
        int(code)
        for code in codes
        if code.isdigit()
        and CUSTOM_EXPENSE_CODE_MIN <= int(code) <= CUSTOM_EXPENSE_CODE_MAX
    }
    if not used:
        return str(CUSTOM_EXPENSE_CODE_MIN)
    next_code = max(used) + 1
    if next_code > CUSTOM_EXPENSE_CODE_MAX:
        raise CustomExpenseCategoryLimitError("Category limit reached")
    return str(next_code)


def create_custom_expense_account(
    session: Session,
    entity_id: uuid.UUID,
    name: str,
) -> Account:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    trimmed = name.strip()
    if not trimmed:
        raise EmptyExpenseCategoryNameError("Category name is required")

    code = _next_custom_expense_code(session, entity_id)

    with entity_context(session, entity_id):
        duplicate = session.scalar(
            select(Account.id).where(
                Account.is_active.is_(True),
                Account.account_type == AccountType.EXPENSE,
                func.lower(Account.name_en) == trimmed.lower(),
            )
        )
        if duplicate is not None:
            raise DuplicateExpenseCategoryNameError(
                "A category with that name already exists"
            )

        account = Account(
            entity_id=entity_id,
            code=code,
            name_en=trimmed,
            name_tr=trimmed,
            account_type=AccountType.EXPENSE,
            normal_balance=AccountNormalBalance.DEBIT,
            accepts_opening_balance=False,
            is_active=True,
            parent_account_id=None,
        )
        session.add(account)
        session.commit()
        session.refresh(account)
        return account
