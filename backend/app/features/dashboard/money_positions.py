"""TRY cash/bank book positions for the dashboard snapshot."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.dashboard.schema import CashAccountBalanceRow


def try_money_position_kurus(
    session: Session,
    *,
    money_account_id: uuid.UUID | None,
    kinds: tuple[MoneyAccountKind, ...] = (
        MoneyAccountKind.BANK,
        MoneyAccountKind.CASH,
    ),
) -> int:
    query = select(MoneyAccount).where(
        MoneyAccount.is_active.is_(True),
        MoneyAccount.account_kind.in_(kinds),
    )
    if money_account_id is not None:
        query = query.where(MoneyAccount.id == money_account_id)

    total = 0
    for money_account in session.scalars(query.order_by(MoneyAccount.name)):
        gl_account = session.get(Account, money_account.gl_account_id)
        if gl_account is None:
            continue
        total += banking_service.gl_balance_kurus(
            session,
            gl_account.id,
            gl_account.normal_balance,
        )
    return total


def cash_account_rows(
    session: Session,
    *,
    money_account_id: uuid.UUID | None,
) -> list[CashAccountBalanceRow]:
    """Active CASH drawers with book balances — itemized for the dashboard card."""
    query = select(MoneyAccount).where(
        MoneyAccount.is_active.is_(True),
        MoneyAccount.account_kind == MoneyAccountKind.CASH,
    )
    if money_account_id is not None:
        query = query.where(MoneyAccount.id == money_account_id)

    rows: list[CashAccountBalanceRow] = []
    for money_account in session.scalars(query.order_by(MoneyAccount.name)):
        gl_account = session.get(Account, money_account.gl_account_id)
        if gl_account is None:
            continue
        rows.append(
            CashAccountBalanceRow(
                id=money_account.id,
                name=money_account.name,
                balance_kurus=banking_service.gl_balance_kurus(
                    session,
                    gl_account.id,
                    gl_account.normal_balance,
                ),
            )
        )
    return rows
