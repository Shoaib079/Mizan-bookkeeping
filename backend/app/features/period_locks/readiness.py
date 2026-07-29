"""Is this month safe to close?

Closing a month is only as honest as the checks behind it. A lock that can be
applied over an unexplained bank line doesn't protect the books — it just
timestamps a wrong number.

One check blocks and the rest warn, deliberately:

- **Unclassified statement lines block.** A statement line that hasn't become a
  journal entry is real money that moved and isn't in the books. Closing over
  it means knowingly sealing a wrong month. There is always a way out — since
  `other_income` landed, every line in either direction has a classification
  that fits (BUGLOG 2026-07-27), so this can't strand the owner. And the cost
  of being wrong here is only that the month stays open, which is harmless.
- **Everything else warns.** A card-clearing residual may legitimately carry
  into next month; a drawer may go uncounted on a day the restaurant was shut;
  an employee may genuinely have no salary this month. These need the owner's
  eye, not a veto.
"""

from __future__ import annotations

import calendar
import enum
import uuid
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import CARD_SALES_CLEARING_CODE
from app.core.chart_of_accounts.models import Account
from app.core.ledger.balances import balance_as_of_kurus
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.types import StaffMovementType
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.banking.statement_models import BankStatement, BankStatementLine
from app.features.cash.models import CashDrawerSession, CashDrawerSessionStatus
from app.features.entities import service as entity_service
from app.features.reports.bank_reconciliation import SETTLED_LINE_STATUSES
from app.features.staff.models import Employee

__all__ = [
    "CheckSeverity",
    "ReadinessCheck",
    "MonthCloseReadiness",
    "get_month_close_readiness",
    "month_bounds",
    "blocking_failures",
]


class CheckSeverity(str, enum.Enum):
    BLOCK = "block"
    WARN = "warn"


@dataclass
class ReadinessCheck:
    key: str
    label: str
    severity: CheckSeverity
    passed: bool
    # Plain-language line the owner reads; empty when the check passed.
    detail: str = ""
    count: int = 0
    amount_kurus: int | None = None
    # Where to go and fix it.
    href: str | None = None


@dataclass
class MonthCloseReadiness:
    year: int
    month: int
    period_start: date
    period_end: date
    checks: list[ReadinessCheck] = field(default_factory=list)

    @property
    def can_close(self) -> bool:
        return not any(
            c.severity == CheckSeverity.BLOCK and not c.passed for c in self.checks
        )

    @property
    def warning_count(self) -> int:
        return sum(
            1 for c in self.checks if c.severity == CheckSeverity.WARN and not c.passed
        )


def month_bounds(year: int, month: int) -> tuple[date, date]:
    if not 1 <= month <= 12:
        raise ValueError("month must be 1..12")
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _unclassified_statement_lines(
    session: Session, period_start: date, period_end: date
) -> ReadinessCheck:
    """Statement lines dated in the month that never became journal entries.

    Scoped by the line's own transaction_date, not the statement's period — an
    import can straddle a month boundary, and it's the transaction that belongs
    to the month, not the file.
    """
    rows = list(
        session.execute(
            select(
                func.count(BankStatementLine.id),
                func.coalesce(func.sum(BankStatementLine.amount_kurus), 0),
            ).where(
                BankStatementLine.transaction_date >= period_start,
                BankStatementLine.transaction_date <= period_end,
                BankStatementLine.status.not_in(SETTLED_LINE_STATUSES),
            )
        )
    )
    count, total = (int(rows[0][0]), int(rows[0][1])) if rows else (0, 0)

    return ReadinessCheck(
        key="unclassified_statement_lines",
        label="Bank statement lines classified",
        severity=CheckSeverity.BLOCK,
        passed=count == 0,
        detail=(
            ""
            if count == 0
            else f"{count} imported line{'' if count == 1 else 's'} still unclassified — "
            "real money that moved and isn't in the books yet."
        ),
        count=count,
        amount_kurus=total if count else None,
        href="/review/bank",
    )


def _card_clearing_residual(session: Session, period_end: date) -> ReadinessCheck:
    """What's left sitting in 1400 at month end.

    A residual is normal — sales deposited after the 1st. It matters because
    this is the account that once absorbed a month of undeposited sales and
    then got swept to expense as a 184k "commission" (BUGLOG 2026-07-13).
    """
    account = session.scalar(
        select(Account).where(Account.code == CARD_SALES_CLEARING_CODE)
    )
    if account is None:
        return ReadinessCheck(
            key="card_clearing_residual",
            label="Card clearing settled",
            severity=CheckSeverity.WARN,
            passed=True,
        )

    residual = balance_as_of_kurus(session, account, period_end)
    return ReadinessCheck(
        key="card_clearing_residual",
        label="Card clearing settled",
        severity=CheckSeverity.WARN,
        passed=residual == 0,
        detail=(
            ""
            if residual == 0
            else "Card sales recorded but not yet matched to a bank deposit. "
            "Normal if deposits land after month end — check it's not older than that."
        ),
        amount_kurus=residual if residual else None,
        href="/cards",
    )


def _open_drawers(
    session: Session, period_start: date, period_end: date
) -> ReadinessCheck:
    open_sessions = list(
        session.scalars(
            select(CashDrawerSession)
            .where(
                CashDrawerSession.session_date >= period_start,
                CashDrawerSession.session_date <= period_end,
                CashDrawerSession.status == CashDrawerSessionStatus.OPEN,
            )
            .order_by(CashDrawerSession.session_date)
        )
    )
    count = len(open_sessions)
    return ReadinessCheck(
        key="open_drawers",
        label="Cash drawers counted",
        severity=CheckSeverity.WARN,
        passed=count == 0,
        detail=(
            ""
            if count == 0
            else f"{count} drawer day{'' if count == 1 else 's'} never counted and closed "
            f"(oldest {open_sessions[0].session_date.strftime('%d.%m.%Y')})."
        ),
        count=count,
        href="/banking/cash",
    )


def _drawer_variance(
    session: Session, period_start: date, period_end: date
) -> ReadinessCheck:
    """Net over/short across every counted drawer day in the month."""
    rows = list(
        session.execute(
            select(
                func.count(CashDrawerSession.id),
                func.coalesce(func.sum(CashDrawerSession.over_short_kurus), 0),
            ).where(
                CashDrawerSession.session_date >= period_start,
                CashDrawerSession.session_date <= period_end,
                CashDrawerSession.status == CashDrawerSessionStatus.CLOSED,
                CashDrawerSession.over_short_kurus.isnot(None),
                CashDrawerSession.over_short_kurus != 0,
            )
        )
    )
    count, net = (int(rows[0][0]), int(rows[0][1])) if rows else (0, 0)
    return ReadinessCheck(
        key="drawer_variance",
        label="Cash counts matched",
        severity=CheckSeverity.WARN,
        passed=count == 0,
        detail=(
            ""
            if count == 0
            else f"{count} day{'' if count == 1 else 's'} came up over or short. "
            "One is noise; a pattern is worth looking into."
        ),
        count=count,
        amount_kurus=net if count else None,
        href="/reports/cash-book",
    )


def _bank_balance_confirmed(
    session: Session, period_start: date, period_end: date
) -> ReadinessCheck:
    """Did the owner tell us what the bank printed for this month?

    Without it we can only prove books against the imported file — which can
    agree with each other while both are missing a whole day.
    """
    bank_accounts = list(
        session.scalars(
            select(MoneyAccount).where(
                MoneyAccount.account_kind == MoneyAccountKind.BANK,
                MoneyAccount.is_active.is_(True),
            )
        )
    )
    missing: list[str] = []
    for account in bank_accounts:
        confirmed = session.scalar(
            select(func.count(BankStatement.id)).where(
                BankStatement.money_account_id == account.id,
                BankStatement.period_end >= period_start,
                BankStatement.period_end <= period_end,
                BankStatement.closing_balance_kurus.isnot(None),
            )
        )
        if not confirmed:
            missing.append(account.name)

    return ReadinessCheck(
        key="bank_balance_confirmed",
        label="Bank closing balances entered",
        severity=CheckSeverity.WARN,
        passed=not missing,
        detail=(
            ""
            if not missing
            else f"No statement closing balance for {', '.join(missing[:3])}"
            + (f" and {len(missing) - 3} more" if len(missing) > 3 else "")
            + " — without it we can't catch transactions missing from the import."
        ),
        count=len(missing),
        href="/reports/bank-reconciliation",
    )


def _salary_accrued(session: Session, year: int, month: int) -> ReadinessCheck:
    """Active staff with no salary accrued for this month."""
    employees = list(
        session.scalars(select(Employee).where(Employee.is_active.is_(True)))
    )
    accrued_ids = set(
        session.scalars(
            select(StaffLedgerEntry.employee_id).where(
                StaffLedgerEntry.movement_type == StaffMovementType.SALARY_ACCRUED,
                StaffLedgerEntry.period_year == year,
                StaffLedgerEntry.period_month == month,
            )
        )
    )
    missing = [e for e in employees if e.id not in accrued_ids]
    return ReadinessCheck(
        key="salary_accrued",
        label="Salaries accrued",
        severity=CheckSeverity.WARN,
        passed=not missing,
        detail=(
            ""
            if not missing
            else f"{', '.join(e.name for e in missing[:3])}"
            + (f" and {len(missing) - 3} more" if len(missing) > 3 else "")
            + " have no salary recorded for this month."
        ),
        count=len(missing),
        href="/balances/staff",
    )


def get_month_close_readiness(
    session: Session, entity_id: uuid.UUID, *, year: int, month: int
) -> MonthCloseReadiness:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    period_start, period_end = month_bounds(year, month)

    with entity_context(session, entity_id):
        require_entity_context()
        checks = [
            _unclassified_statement_lines(session, period_start, period_end),
            _card_clearing_residual(session, period_end),
            _open_drawers(session, period_start, period_end),
            _drawer_variance(session, period_start, period_end),
            _bank_balance_confirmed(session, period_start, period_end),
            _salary_accrued(session, year, month),
        ]

    return MonthCloseReadiness(
        year=year,
        month=month,
        period_start=period_start,
        period_end=period_end,
        checks=checks,
    )


def blocking_failures(readiness: MonthCloseReadiness) -> list[ReadinessCheck]:
    return [
        c
        for c in readiness.checks
        if c.severity == CheckSeverity.BLOCK and not c.passed
    ]
