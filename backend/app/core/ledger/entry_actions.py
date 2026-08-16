"""Resolve edit/void targets for a journal entry — used by the GL inline actions."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
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
    #: How many *owners* the entry's subledger rows belong to.
    #
    #: One for almost everything. A profit allocation writes a row per partner
    #: against a single journal entry, so this is the partner count — and a
    #: screen showing one partner's row must not offer to void it, because
    #: voiding reverses every partner's share. The General ledger shows the
    #: entry itself and is free to.
    #:
    #: Distinct owners, not row count: a salary payment that consumed an
    #: advance also writes two rows, but both belong to the same employee, so
    #: voiding it from that employee's page affects nobody else. Counting rows
    #: would have hidden a button that works.
    owner_count: int = 1


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
    restaurant exist, does the entry exist, and is it still posted.

    For a page of rows use `resolve_entry_actions_for_ids` below, which does
    the first of those once instead of once per row.
    """
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        entry = session.get(JournalEntry, entry_id)
        if entry is None:
            raise EntryNotFoundError("Journal entry not found")
        return _resolve_posted(session, entry)


def _resolve_posted(session: Session, entry: JournalEntry) -> LedgerEntryActions:
    """The verdict for an entry already loaded inside an entity context.

    A voided entry offers nothing regardless of what it was, which is why that
    gate lives here rather than being repeated in every row of the table.
    """
    from app.core.ledger.entry_capabilities import resolve_from_table

    if entry.status != JournalEntryStatus.POSTED:
        return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
    return resolve_from_table(session, entry)


def resolve_entry_actions_for_ids(
    session: Session,
    entity_id: uuid.UUID,
    entry_ids: Sequence[uuid.UUID],
) -> dict[uuid.UUID, LedgerEntryActions]:
    """Verdicts for a page of entries, asked once rather than one at a time.

    The single-entry function above checks the restaurant exists and opens an
    entity context every time it is called. Over a fifty-row ledger that is
    fifty existence checks and fifty context switches before any real work,
    which is most of why drawing the buttons took long enough to see.

    Ids that name nothing are absent from the result, exactly as they are from
    the batch route: a page asks about the rows it is showing, and if one has
    gone the honest answer is nothing for that row rather than an error that
    hides the other forty-nine.

    Callers must not assume order, and must not assume every id comes back.
    """
    if not entry_ids:
        return {}
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    wanted = list(dict.fromkeys(entry_ids))
    with entity_context(session, entity_id):
        require_entity_context()
        entries = session.scalars(
            select(JournalEntry).where(JournalEntry.id.in_(wanted))
        ).all()
        return {entry.id: _resolve_posted(session, entry) for entry in entries}
