"""Effective-only subledger totals — exclude voided / superseded rows from balances."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Sequence
from typing import Any

from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntry
from app.core.ledger.subledger_display import (
    is_effective_subledger_row,
    load_journals_for_rows,
    subledger_display_for_row,
)
from app.db.session import require_entity_context


def effective_amount(
    session: Session,
    *,
    journal_entry_id: uuid.UUID | None,
    description: str,
    amount: int,
    journals: dict[uuid.UUID, JournalEntry] | None = None,
) -> int:
    kind, _ = subledger_display_for_row(
        session,
        journal_entry_id=journal_entry_id,
        description=description,
        journals=journals,
    )
    if not is_effective_subledger_row(kind):
        return 0
    return amount


def effective_total_for_rows(
    session: Session,
    rows: Sequence[Any],
    *,
    amount: Callable[[Any], int],
    journal_entry_id: Callable[[Any], uuid.UUID | None],
    description: Callable[[Any], str],
) -> int:
    require_entity_context()
    if not rows:
        return 0
    journals = load_journals_for_rows(
        session, [journal_entry_id(row) for row in rows]
    )
    return sum(
        effective_amount(
            session,
            journal_entry_id=journal_entry_id(row),
            description=description(row),
            amount=amount(row),
            journals=journals,
        )
        for row in rows
    )


def effective_total_for_scalars(
    session: Session,
    rows,
    *,
    amount: Callable[[Any], int],
    journal_entry_id: Callable[[Any], uuid.UUID | None],
    description: Callable[[Any], str],
) -> int:
    return effective_total_for_rows(
        session,
        list(rows),
        amount=amount,
        journal_entry_id=journal_entry_id,
        description=description,
    )
