"""Profit & Loss and Balance Sheet reports (Phase 7 Slice 3)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.balances import (
    P_AND_L_EXCLUDED_SOURCES,
    balance_as_of_kurus,
    period_activity_kurus,
)
from app.core.period_locks import snapshot as period_snapshot
from app.core.period_locks.models import PeriodLock
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.reports.schema import (
    BalanceSheetAccountRow,
    BalanceSheetEquitySection,
    BalanceSheetRead,
    BalanceSheetSection,
    ProfitAndLossAccountRow,
    ProfitAndLossRead,
    SealedPeriodInfo,
)
from app.features.reports.service import InvalidDateRangeError

__all__ = ["get_balance_sheet", "get_profit_and_loss"]

#: Ask for the sealed figures when the period is a closed month, or force the
#: live books. Default is sealed — a month you exported should keep reading the
#: way you exported it.
VIEW_AS_CLOSED = "as_closed"
VIEW_LIVE = "live"


#: What a type's balance means when it is positive. An account whose
#: normal_balance opposes this is a *contra* account: Owner Drawings (3200) is
#: equity with a DEBIT normal balance, so its natural positive balance is money
#: taken *out* of equity.
_TYPE_NORMAL_BALANCE = {
    AccountType.ASSET: AccountNormalBalance.DEBIT,
    AccountType.EXPENSE: AccountNormalBalance.DEBIT,
    AccountType.LIABILITY: AccountNormalBalance.CREDIT,
    AccountType.EQUITY: AccountNormalBalance.CREDIT,
    AccountType.REVENUE: AccountNormalBalance.CREDIT,
}


def _statement_signed_kurus(account: Account, natural_kurus: int) -> int:
    """A natural balance re-signed for the section it is reported in.

    `balance_as_of_kurus` returns the balance in the account's *own* normal
    direction, so Owner Drawings comes back positive when money has been drawn.
    Summing that straight into equity *added* drawings to equity instead of
    deducting them, which is what broke the accounting equation — the ledger
    was balanced all along, the report was signing one account the wrong way.

    Reported at the row level, not just in the subtotal, so a reader sees
    "Owner Drawings −1.234,00" under Equity and the section visibly adds up.
    """
    if account.normal_balance == _TYPE_NORMAL_BALANCE[account.account_type]:
        return natural_kurus
    return -natural_kurus


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


def _accounts_with_balances(
    session: Session,
    account_types: tuple[AccountType, ...],
    as_of_date: date,
) -> list[Account]:
    """Active accounts, plus any deactivated one still carrying a balance.

    Deactivating an account does not remove its postings. Filtering a statement
    to active accounts alone therefore drops real money out of one side of the
    equation while the ledger still holds both sides — and the balance sheet
    stops balancing, with no clue as to why.

    The sealed-snapshot path (`_accounts_by_id`) and the year-end close
    (`year_end._temporary_accounts`) already refuse to filter on `is_active`
    for exactly this reason; the live statements were the one place that still
    did. Inactive accounts that are genuinely empty stay hidden, so a long
    chart of accounts doesn't fill up with zero rows.
    """
    inactive_with_balance = [
        account
        for account in session.scalars(
            select(Account)
            .where(
                Account.is_active.is_(False),
                Account.account_type.in_(account_types),
            )
            .order_by(Account.code)
        )
        if balance_as_of_kurus(session, account, as_of_date) != 0
    ]
    accounts = _active_accounts(session, account_types) + inactive_with_balance
    return sorted(accounts, key=lambda account: account.code)


def _accounts_with_activity(
    session: Session,
    account_types: tuple[AccountType, ...],
    from_date: date,
    to_date: date,
) -> list[Account]:
    """Active accounts, plus any deactivated one that moved in the period.

    The P&L equivalent of `_accounts_with_balances`: an expense account
    deactivated after it was used would otherwise vanish from the statement and
    the period would understate its own costs.
    """
    inactive_with_activity = [
        account
        for account in session.scalars(
            select(Account)
            .where(
                Account.is_active.is_(False),
                Account.account_type.in_(account_types),
            )
            .order_by(Account.code)
        )
        if period_activity_kurus(
            session,
            account,
            from_date,
            to_date,
            exclude_sources=P_AND_L_EXCLUDED_SOURCES,
        )
        != 0
    ]
    accounts = _active_accounts(session, account_types) + inactive_with_activity
    return sorted(accounts, key=lambda account: account.code)


def _sealed_context(
    session: Session,
    *,
    view: str,
    period_start: date,
    period_end: date,
) -> tuple[PeriodLock | None, dict[uuid.UUID, period_snapshot.SnapshotFigures]]:
    """The lock and frozen figures to serve, or (None, {}) to serve live.

    A lock with no snapshot rows means the month was closed before snapshots
    existed. There is nothing frozen to show, so it falls through to live
    rather than reporting an empty statement.
    """
    if view != VIEW_AS_CLOSED:
        return None, {}
    lock = period_snapshot.active_month_lock(
        session, period_start=period_start, period_end=period_end
    )
    if lock is None:
        return None, {}
    figures = period_snapshot.snapshot_figures_by_account(session, lock.id)
    if not figures:
        return None, {}
    return lock, figures


def _accounts_by_id(
    session: Session, account_ids: list[uuid.UUID]
) -> list[Account]:
    """Accounts a snapshot covers, active or not, in code order.

    Deliberately not filtered by ``is_active``: deactivating an account after a
    month closed must not silently drop its figures out of that month and
    change a total the owner already sent to their accountant.
    """
    if not account_ids:
        return []
    return list(
        session.scalars(
            select(Account).where(Account.id.in_(account_ids)).order_by(Account.code)
        )
    )


def _unclosed_net_income_kurus(session: Session, as_of_date: date) -> int:
    """Result not yet moved into equity.

    Deliberately does NOT exclude the year-end entry, unlike the P&L. That
    entry zeroes the revenue and expense balances, so once a year is closed
    this figure naturally falls back to the current year's result alone —
    which is the whole point of closing (FINANCIAL_AUDIT F4). Excluding it here
    would leave every past year permanently stacked in this one line.
    """
    revenue_total = 0
    expense_total = 0
    for account in _accounts_with_balances(
        session, (AccountType.REVENUE, AccountType.EXPENSE), as_of_date
    ):
        balance = _statement_signed_kurus(
            account, balance_as_of_kurus(session, account, as_of_date)
        )
        if account.account_type == AccountType.REVENUE:
            revenue_total += balance
        else:
            expense_total += balance
    return revenue_total - expense_total


def _live_net_income_kurus(session: Session, from_date: date, to_date: date) -> int:
    revenue = 0
    expenses = 0
    for account in _accounts_with_activity(
        session, (AccountType.REVENUE, AccountType.EXPENSE), from_date, to_date
    ):
        amount = _statement_signed_kurus(
            account,
            period_activity_kurus(
                session,
                account,
                from_date,
                to_date,
                exclude_sources=P_AND_L_EXCLUDED_SOURCES,
            ),
        )
        if account.account_type == AccountType.REVENUE:
            revenue += amount
        else:
            expenses += amount
    return revenue - expenses


def get_profit_and_loss(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
    *,
    view: str = VIEW_AS_CLOSED,
) -> ProfitAndLossRead:
    if from_date > to_date:
        raise InvalidDateRangeError("from must be on or before to")

    _require_entity(session, entity_id)

    rows: list[ProfitAndLossAccountRow] = []
    total_revenue = 0
    total_expenses = 0
    sealed: SealedPeriodInfo | None = None

    with entity_context(session, entity_id):
        require_entity_context()

        lock, figures = _sealed_context(
            session, view=view, period_start=from_date, period_end=to_date
        )

        if lock is not None:
            accounts = [
                a
                for a in _accounts_by_id(session, list(figures))
                if a.account_type in (AccountType.REVENUE, AccountType.EXPENSE)
            ]
        else:
            accounts = _accounts_with_activity(
                session,
                (AccountType.REVENUE, AccountType.EXPENSE),
                from_date,
                to_date,
            )

        for account in accounts:
            if lock is not None:
                # An account created after the close isn't in the snapshot; it
                # contributed nothing to the month as reported, so 0 is right.
                amount = (
                    figures[account.id].period_activity_kurus
                    if account.id in figures
                    else 0
                )
            else:
                amount = period_activity_kurus(
                    session,
                    account,
                    from_date,
                    to_date,
                    exclude_sources=P_AND_L_EXCLUDED_SOURCES,
                )
            # Same contra handling as the balance sheet: a refunds account
            # sitting against revenue, or a rebate against an expense, must
            # reduce its section rather than inflate it.
            amount = _statement_signed_kurus(account, amount)
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

        if lock is not None:
            net_income = total_revenue - total_expenses
            drift = (
                _live_net_income_kurus(session, from_date, to_date) - net_income
                if lock.dirty
                else None
            )
            sealed = SealedPeriodInfo(
                period_start=lock.period_start,
                period_end=lock.period_end,
                closed_at=lock.closed_at,
                drifted=lock.dirty,
                drift_kurus=drift,
            )

    return ProfitAndLossRead(
        entity_id=entity_id,
        from_date=from_date,
        to_date=to_date,
        accounts=rows,
        total_revenue_kurus=total_revenue,
        total_expenses_kurus=total_expenses,
        net_income_kurus=total_revenue - total_expenses,
        source=VIEW_AS_CLOSED if sealed is not None else VIEW_LIVE,
        sealed=sealed,
    )


def get_balance_sheet(
    session: Session,
    entity_id: uuid.UUID,
    as_of_date: date,
    *,
    view: str = VIEW_AS_CLOSED,
) -> BalanceSheetRead:
    _require_entity(session, entity_id)

    asset_rows: list[BalanceSheetAccountRow] = []
    liability_rows: list[BalanceSheetAccountRow] = []
    equity_rows: list[BalanceSheetAccountRow] = []
    sealed: SealedPeriodInfo | None = None

    with entity_context(session, entity_id):
        require_entity_context()

        # A balance sheet is asked "as of" a date, so the sealed figures apply
        # when that date is exactly a closed month's last day.
        month_start = as_of_date.replace(day=1)
        lock, figures = _sealed_context(
            session, view=view, period_start=month_start, period_end=as_of_date
        )

        if lock is not None:
            accounts = [
                a
                for a in _accounts_by_id(session, list(figures))
                if a.account_type
                in (AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY)
            ]
        else:
            accounts = _accounts_with_balances(
                session,
                (AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY),
                as_of_date,
            )

        for account in accounts:
            if lock is not None:
                balance = (
                    figures[account.id].closing_balance_kurus
                    if account.id in figures
                    else 0
                )
            else:
                balance = balance_as_of_kurus(session, account, as_of_date)
            row = BalanceSheetAccountRow(
                account_id=account.id,
                code=account.code,
                name_en=account.name_en,
                account_type=account.account_type,
                balance_kurus=_statement_signed_kurus(account, balance),
            )
            if account.account_type == AccountType.ASSET:
                asset_rows.append(row)
            elif account.account_type == AccountType.LIABILITY:
                liability_rows.append(row)
            else:
                equity_rows.append(row)

        if lock is not None:
            # Rebuild from the same frozen figures, or the sheet wouldn't
            # balance: sealed assets against a live net income.
            sealed_net_income = 0
            for account in _accounts_by_id(session, list(figures)):
                signed = _statement_signed_kurus(
                    account, figures[account.id].closing_balance_kurus
                )
                if account.account_type == AccountType.REVENUE:
                    sealed_net_income += signed
                elif account.account_type == AccountType.EXPENSE:
                    sealed_net_income -= signed
            unclosed_net_income = sealed_net_income
        else:
            unclosed_net_income = _unclosed_net_income_kurus(session, as_of_date)

        if lock is not None:
            sealed_assets = sum(row.balance_kurus for row in asset_rows)
            drift = None
            if lock.dirty:
                # Same population as the rows above, or the drift figure
                # reports a difference that is only the filter.
                live_assets = sum(
                    balance_as_of_kurus(session, account, as_of_date)
                    for account in _accounts_with_balances(
                        session, (AccountType.ASSET,), as_of_date
                    )
                )
                drift = live_assets - sealed_assets
            sealed = SealedPeriodInfo(
                period_start=lock.period_start,
                period_end=lock.period_end,
                closed_at=lock.closed_at,
                drifted=lock.dirty,
                drift_kurus=drift,
            )

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
        source=VIEW_AS_CLOSED if sealed is not None else VIEW_LIVE,
        sealed=sealed,
    )
