"""Derive statement closing balances from the book chain, not raw Bakiye alone."""

from __future__ import annotations

import uuid

from datetime import date

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.ledger.balances import balance_as_of_kurus
from app.features.banking.statement_models import (
    BankStatement,
    BankStatementLine,
    StatementLineClassification,
    StatementLineStatus,
)

SETTLED_LINE_STATUSES = (StatementLineStatus.POSTED, StatementLineStatus.LINKED)

_BOUNCED_SETTLED = and_(
    BankStatementLine.status == StatementLineStatus.CLASSIFIED,
    BankStatementLine.classification == StatementLineClassification.PAYMENT_BOUNCED,
    BankStatementLine.bounce_pair_id.isnot(None),
)


def _line_is_settled_sql():
    return or_(
        BankStatementLine.status.in_(SETTLED_LINE_STATUSES),
        _BOUNCED_SETTLED,
    )


def closing_from_book_chain(
    session: Session,
    gl_account: Account,
    *,
    opening_as_of: date,
    period_line_sum_kurus: int,
) -> int:
    """Book balance at the prior period end plus this statement's imported lines."""
    opening = balance_as_of_kurus(session, gl_account, opening_as_of)
    return opening + period_line_sum_kurus


def effective_stated_closing_balance_kurus(
    session: Session,
    gl_account: Account,
    statements: list[BankStatement],
    latest: BankStatement | None,
) -> int | None:
    """Closing balance to compare against the books in bank reconciliation.

    İş Bank sometimes prints Bakiye *before* an outflow (e.g. SGK) or leaves
    Bakiye blank on later same-day rows, so the raw column can disagree with
    the sum of lines. Once every line on the latest statement is settled, the
    book chain (opening book + imported lines) is authoritative.
    """
    if latest is None:
        return None

    latest_pending = int(
        session.scalar(
            select(func.count()).where(
                BankStatementLine.statement_id == latest.id,
                ~_line_is_settled_sql(),
            )
        )
        or 0
    )
    if latest_pending:
        return latest.closing_balance_kurus

    latest_line_sum = int(
        session.scalar(
            select(func.coalesce(func.sum(BankStatementLine.amount_kurus), 0)).where(
                BankStatementLine.statement_id == latest.id
            )
        )
        or 0
    )

    previous = next((s for s in statements if s.period_end < latest.period_end), None)
    if previous is not None:
        return closing_from_book_chain(
            session,
            gl_account,
            opening_as_of=previous.period_end,
            period_line_sum_kurus=latest_line_sum,
        )

    return latest.closing_balance_kurus


def resolve_import_closing_balance_kurus(
    session: Session,
    money_account_gl_account_id: uuid.UUID,
    *,
    parsed_closing_balance_kurus: int | None,
    parsed_period_start: date,
    imported_line_sum_kurus: int,
    money_account_id: uuid.UUID,
) -> int | None:
    """Pick closing balance when persisting a newly imported statement."""
    previous = session.scalar(
        select(BankStatement)
        .where(
            BankStatement.money_account_id == money_account_id,
            BankStatement.period_end < parsed_period_start,
        )
        .order_by(BankStatement.period_end.desc())
        .limit(1)
    )
    if previous is None:
        return parsed_closing_balance_kurus

    gl_account = session.get(Account, money_account_gl_account_id)
    if gl_account is None:
        return parsed_closing_balance_kurus

    return closing_from_book_chain(
        session,
        gl_account,
        opening_as_of=previous.period_end,
        period_line_sum_kurus=imported_line_sum_kurus,
    )
