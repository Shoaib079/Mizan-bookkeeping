"""Operational subledger display — effective vs correction history (Decisions §1)."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Sequence
from enum import StrEnum
from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntry, JournalEntryStatus
from app.db.session import require_entity_context

VOID_DESCRIPTION_PREFIX = "Void:"

TEntryModel = TypeVar("TEntryModel", bound=BaseModel)


class SubledgerDisplayKind(StrEnum):
    EFFECTIVE = "effective"
    VOID_REVERSAL = "void_reversal"
    SUPERSEDED = "superseded"


def is_void_description(description: str) -> bool:
    return description.startswith(VOID_DESCRIPTION_PREFIX)


def classify_subledger_row(
    *,
    description: str,
    journal: JournalEntry | None,
) -> tuple[SubledgerDisplayKind, bool]:
    is_void_reversal = (
        journal is not None and journal.reverses_entry_id is not None
    ) or is_void_description(description)
    is_superseded = (
        journal is not None
        and journal.status == JournalEntryStatus.VOIDED
        and not is_void_reversal
    )
    was_corrected = journal is not None and journal.amends_entry_id is not None
    if is_void_reversal:
        return SubledgerDisplayKind.VOID_REVERSAL, was_corrected
    if is_superseded:
        return SubledgerDisplayKind.SUPERSEDED, was_corrected
    return SubledgerDisplayKind.EFFECTIVE, was_corrected


def is_effective_subledger_row(kind: SubledgerDisplayKind) -> bool:
    return kind == SubledgerDisplayKind.EFFECTIVE


def effective_subledger_sql_filter(description_col, journal_cls=JournalEntry):
    """`is_effective_subledger_row` expressed in SQL, for aggregates.

    The Python classifier works on rows already loaded with their journal.
    An aggregate cannot afford that, and the version that was written by hand
    instead got it wrong: the forex receivable balance excluded reversed
    *sales* (via `amount_kurus > 0`) but counted voided *payments* in full, so
    a customer who had a payment corrected appeared to have paid twice. On
    India Gate that read as "$298.00 paid ahead" on a ledger that was settled.

    Derivation, so the two definitions can be checked against each other:

        effective  ⟺  not void_reversal and not superseded
                   ⟺  not void_reversal and not (VOIDED and not void_reversal)
                   ⟺  not void_reversal and not VOIDED

    Requires the caller to outer-join `journal_cls`; a row with no journal is
    effective, because there is nothing that could have voided it.
    """
    from sqlalchemy import and_, or_

    not_void_reversal = and_(
        or_(journal_cls.id.is_(None), journal_cls.reverses_entry_id.is_(None)),
        description_col.not_like(f"{VOID_DESCRIPTION_PREFIX}%"),
    )
    not_voided = or_(
        journal_cls.id.is_(None),
        journal_cls.status != JournalEntryStatus.VOIDED,
    )
    return and_(not_void_reversal, not_voided)


def load_journals_for_rows(
    session: Session, journal_entry_ids: Sequence[uuid.UUID | None]
) -> dict[uuid.UUID, JournalEntry]:
    ids = {jid for jid in journal_entry_ids if jid is not None}
    if not ids:
        return {}
    entries = session.scalars(select(JournalEntry).where(JournalEntry.id.in_(ids)))
    return {entry.id: entry for entry in entries}


def subledger_display_for_row(
    session: Session,
    *,
    journal_entry_id: uuid.UUID | None,
    description: str,
    journals: dict[uuid.UUID, JournalEntry] | None = None,
) -> tuple[SubledgerDisplayKind, bool]:
    journal: JournalEntry | None = None
    if journal_entry_id is not None:
        if journals is not None:
            journal = journals.get(journal_entry_id)
        else:
            journal = session.get(JournalEntry, journal_entry_id)
    return classify_subledger_row(description=description, journal=journal)


def batch_subledger_display(
    session: Session,
    rows: Sequence[Any],
    *,
    journal_entry_id: Callable[[Any], uuid.UUID | None],
    description: Callable[[Any], str],
) -> list[tuple[SubledgerDisplayKind, bool]]:
    journals = load_journals_for_rows(
        session, [journal_entry_id(row) for row in rows]
    )
    return [
        subledger_display_for_row(
            session,
            journal_entry_id=journal_entry_id(row),
            description=description(row),
            journals=journals,
        )
        for row in rows
    ]


def enrich_entry_model(
    entry_model: type[TEntryModel],
    row: Any,
    display: tuple[SubledgerDisplayKind, bool],
) -> TEntryModel:
    kind, was_corrected = display
    return entry_model.model_validate(row).model_copy(
        update={"display_kind": kind, "was_corrected": was_corrected}
    )


def enrich_entry_models(
    session: Session,
    entry_model: type[TEntryModel],
    rows: Sequence[Any],
    *,
    journal_entry_id: Callable[[Any], uuid.UUID | None],
    description: Callable[[Any], str],
) -> list[TEntryModel]:
    require_entity_context()
    displays = batch_subledger_display(
        session,
        rows,
        journal_entry_id=journal_entry_id,
        description=description,
    )
    return [
        enrich_entry_model(entry_model, row, display)
        for row, display in zip(rows, displays, strict=True)
    ]
