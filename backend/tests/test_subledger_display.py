"""Subledger display classification for operational ledger views."""

from __future__ import annotations

import uuid
from datetime import date

from app.core.ledger.models import JournalEntry, JournalEntrySource, JournalEntryStatus
from app.core.ledger.subledger_display import (
    SubledgerDisplayKind,
    classify_subledger_row,
    is_effective_subledger_row,
)


def _journal(
    *,
    status: JournalEntryStatus = JournalEntryStatus.POSTED,
    reverses_entry_id: uuid.UUID | None = None,
    amends_entry_id: uuid.UUID | None = None,
) -> JournalEntry:
    return JournalEntry(
        id=uuid.uuid4(),
        entity_id=uuid.uuid4(),
        entry_date=date(2026, 5, 1),
        description="Test",
        status=status,
        source=JournalEntrySource.STAFF_PAYMENT,
        reverses_entry_id=reverses_entry_id,
        amends_entry_id=amends_entry_id,
    )


def test_effective_posted_row() -> None:
    kind, corrected = classify_subledger_row(
        description="Salary payment",
        journal=_journal(),
    )
    assert kind == SubledgerDisplayKind.EFFECTIVE
    assert corrected is False


def test_void_reversal_by_prefix() -> None:
    kind, _ = classify_subledger_row(
        description="Void: Salary payment",
        journal=None,
    )
    assert kind == SubledgerDisplayKind.VOID_REVERSAL


def test_void_reversal_by_journal_link() -> None:
    kind, _ = classify_subledger_row(
        description="Salary payment",
        journal=_journal(reverses_entry_id=uuid.uuid4()),
    )
    assert kind == SubledgerDisplayKind.VOID_REVERSAL


def test_superseded_original() -> None:
    kind, _ = classify_subledger_row(
        description="Salary 2026-04",
        journal=_journal(status=JournalEntryStatus.VOIDED),
    )
    assert kind == SubledgerDisplayKind.SUPERSEDED


def test_corrected_replacement() -> None:
    kind, corrected = classify_subledger_row(
        description="Salary 2026-04",
        journal=_journal(amends_entry_id=uuid.uuid4()),
    )
    assert kind == SubledgerDisplayKind.EFFECTIVE
    assert corrected is True


def test_is_effective_filter() -> None:
    assert is_effective_subledger_row(SubledgerDisplayKind.EFFECTIVE)
    assert not is_effective_subledger_row(SubledgerDisplayKind.VOID_REVERSAL)
