"""Resolve edit/void targets for a journal entry — used by the GL inline actions."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.core.ledger.correction import GENERIC_CORRECTABLE_SOURCES
from app.core.ledger.models import JournalEntry, JournalEntrySource, JournalEntryStatus
from app.core.ledger.posting import EntryNotFoundError
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service


@dataclass(frozen=True, slots=True)
class LedgerEntryEditContext:
    kind: str
    context: dict[str, Any]


@dataclass(frozen=True, slots=True)
class LedgerEntryActions:
    can_edit: bool
    can_void: bool
    void_path: str | None
    edit: LedgerEntryEditContext | None = None


def _generic_void_path(entry_id: uuid.UUID) -> str:
    return f"ledger/entries/{entry_id}/void"


def _is_generic_void_safe(source: JournalEntrySource) -> bool:
    if source in GENERIC_CORRECTABLE_SOURCES:
        return True
    return source in {
        JournalEntrySource.TRANSFER,
        JournalEntrySource.YEAR_END_CLOSE,
        JournalEntrySource.CASH_DRAWER_CLOSE,
    }


def resolve_ledger_entry_actions(
    session: Session,
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
) -> LedgerEntryActions:
    """What the app may offer for one posted entry.

    This used to be 46 hand-written branches, each finding a subledger row,
    formatting a void path from it and building an edit context. They were the
    second of five places that decided edit/void, and every void bug reported
    over months was two of those five disagreeing.

    The branches now live in `CAPABILITIES` as data. What is left here is what
    genuinely belongs to the *entry* rather than to its source: does the
    restaurant exist, does the entry exist, and is it still posted. A voided
    entry offers nothing regardless of what it was — which is why that gate
    stays here rather than being repeated in every row of the table.
    """
    from app.core.ledger.entry_capabilities import resolve_from_table

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        entry = session.get(JournalEntry, entry_id)
        if entry is None:
            raise EntryNotFoundError("Journal entry not found")
        if entry.status != JournalEntryStatus.POSTED:
            return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
        return resolve_from_table(session, entry)
