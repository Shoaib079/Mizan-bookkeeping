"""Settled-state helpers for bank statement lines."""

from __future__ import annotations

from app.features.banking.statement_models import (
    BankStatementLine,
    StatementLineClassification,
    StatementLineStatus,
)

SETTLED_STATUSES = frozenset(
    {
        StatementLineStatus.POSTED,
        StatementLineStatus.LINKED,
    }
)


def is_bounce_settled_line(line: BankStatementLine) -> bool:
    return (
        line.status == StatementLineStatus.CLASSIFIED
        and line.classification == StatementLineClassification.PAYMENT_BOUNCED
        and line.bounce_pair_id is not None
    )


def statement_line_is_settled(line: BankStatementLine) -> bool:
    if line.status in SETTLED_STATUSES:
        return True
    return is_bounce_settled_line(line)
