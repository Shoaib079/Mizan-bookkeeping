"""Profit & Loss and Balance Sheet reports (Phase 7 Slice 3)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountType
from app.core.ledger.balances import balance_as_of_kurus, period_activity_kurus
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.reports.schema import (
    BalanceSheetAccountRow,
    BalanceSheetEquitySection,
    BalanceSheetRead,
    BalanceSheetSection,
    ProfitAndLossAccountRow,
    ProfitAndLossRead,
)
from app.features.reports.service import InvalidDateRangeError

__all__ = ["get_balance_sheet", "get_profit_and_loss"]


def _require_entity(session: Session, entity_id: uuid.UUID) -> None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")


def _active_accounts(
    session: Session,
    account_types: tuple[AccountType, ...],
) -> list[Account]:
    return list(
        session.scalars(
            select(Account)
            .where(
                Account.is_active.is_(True),
                Account.account_type.in_(account_types),
            )
            .order_by(Account.code)
        )
    )


def _unclosed_net_income_kurus(session: Session, as_of_date: date) -> int:
    revenue_total = 0
    expense_total = 0
    for account in _active_accounts(session, (AccountType.REVENUE, AccountType.EXPENSE)):
        balance = balance_as_of_kurus(session, account, as_of_date)
        if account.account_type == AccountType.REVENUE:
            revenue_total += balance
        else:
            expense_total += balance
    return revenue_total - expense_total


def get_profit_and_loss(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
) -> ProfitAndLossRead:
    if from_date > to_date:
        raise InvalidDateRangeError("from must be on or before to")

    _require_entity(session, entity_id)

    rows: list[ProfitAndLossAccountRow] = []
    total_revenue = 0
    total_expenses = 0

    with entity_context(session, entity_id):
        require_entity_context()

        for account in _active_accounts(session, (AccountType.REVENUE, AccountType.EXPENSE)):
            amount = period_activity_kurus(session, account, from_date, to_date)
            rows.append(
                ProfitAndLossAccountRow(
                    account_id=account.id,
                    code=account.code,
                    name_en=account.name_en,
                    account_type=account.account_type,
                    amount_kurus=amount,
                )
            )
            if account.account_type == AccountType.REVENUE:
                total_revenue += amount
            else:
                total_expenses += amount

    return ProfitAndLossRead(
        entity_id=entity_id,
        from_date=from_date,
        to_date=to_date,
        accounts=rows,
        total_revenue_kurus=total_revenue,
        total_expenses_kurus=total_expenses,
        net_income_kurus=total_revenue - total_expenses,
    )


def get_balance_sheet(
    session: Session,
    entity_id: uuid.UUID,
    as_of_date: date,
) -> BalanceSheetRead:
    _require_entity(session, entity_id)

    asset_rows: list[BalanceSheetAccountRow] = []
    liability_rows: list[BalanceSheetAccountRow] = []
    equity_rows: list[BalanceSheetAccountRow] = []

    with entity_context(session, entity_id):
        require_entity_context()

        for account in _active_accounts(
            session,
            (AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY),
        ):
            balance = balance_as_of_kurus(session, account, as_of_date)
            row = BalanceSheetAccountRow(
                account_id=account.id,
                code=account.code,
                name_en=account.name_en,
                account_type=account.account_type,
                balance_kurus=balance,
            )
            if account.account_type == AccountType.ASSET:
                asset_rows.append(row)
            elif account.account_type == AccountType.LIABILITY:
                liability_rows.append(row)
            else:
                equity_rows.append(row)

        unclosed_net_income = _unclosed_net_income_kurus(session, as_of_date)

    total_assets = sum(row.balance_kurus for row in asset_rows)
    total_liabilities = sum(row.balance_kurus for row in liability_rows)
    total_equity_gl = sum(row.balance_kurus for row in equity_rows)
    total_liabilities_and_equity = (
        total_liabilities + total_equity_gl + unclosed_net_income
    )

    return BalanceSheetRead(
        entity_id=entity_id,
        as_of=as_of_date,
        assets=BalanceSheetSection(
            accounts=asset_rows,
            subtotal_kurus=total_assets,
        ),
        liabilities=BalanceSheetSection(
            accounts=liability_rows,
            subtotal_kurus=total_liabilities,
        ),
        equity=BalanceSheetEquitySection(
            accounts=equity_rows,
            subtotal_kurus=total_equity_gl,
            unclosed_net_income_kurus=unclosed_net_income,
        ),
        total_assets_kurus=total_assets,
        total_liabilities_kurus=total_liabilities,
        total_equity_kurus=total_equity_gl,
        total_liabilities_and_equity_kurus=total_liabilities_and_equity,
        accounting_equation_balanced=total_assets == total_liabilities_and_equity,
    )
