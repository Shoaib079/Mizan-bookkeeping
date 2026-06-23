"""Ledger feature service — void/correct delegate to core/ledger posting boundary."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource, JournalEntryStatus
from app.core.ledger.correction import (
    SubledgerBackedCorrectionError,
    is_subledger_backed_source,
    resolve_correction_route,
)
from app.core.ledger.posting import PostingLine, correct_journal_entry, void_journal_entry
from app.db.session import entity_context
from app.core.listing import (
    ListParams,
    amount_range_filters,
    date_range_filters,
    fetch_paginated,
    text_search_filter,
)
from app.db.session import entity_context
from app.features.entities import service as entity_service
from app.features.ledger.schema import (
    CorrectJournalEntryRequest,
    JournalEntryLineOut,
    JournalEntryOut,
    VoidJournalEntryRequest,
)


def _to_journal_entry_out(entry: JournalEntry) -> JournalEntryOut:
    return JournalEntryOut(
        id=entry.id,
        entity_id=entry.entity_id,
        entry_date=entry.entry_date,
        description=entry.description,
        status=entry.status,
        source=entry.source,
        reverses_entry_id=entry.reverses_entry_id,
        reversed_by_entry_id=entry.reversed_by_entry_id,
        amends_entry_id=entry.amends_entry_id,
        amended_by_entry_id=entry.amended_by_entry_id,
        voided_at=entry.voided_at,
        created_at=entry.created_at,
        lines=[JournalEntryLineOut.model_validate(line) for line in entry.lines],
    )


def list_journal_entries(
    session: Session,
    entity_id: uuid.UUID,
    *,
    status: JournalEntryStatus | None = None,
    source: JournalEntrySource | None = None,
    entry_date_from: date | None = None,
    entry_date_to: date | None = None,
    q: str | None = None,
    min_amount: int | None = None,
    max_amount: int | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[JournalEntryOut], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        filters = []
        if status is not None:
            filters.append(JournalEntry.status == status)
        if source is not None:
            filters.append(JournalEntry.source == source)
        filters.extend(
            date_range_filters(
                JournalEntry.entry_date,
                from_date=entry_date_from,
                to_date=entry_date_to,
            )
        )
        search = text_search_filter(q, JournalEntry.description)
        if search is not None:
            filters.append(search)
        if min_amount is not None or max_amount is not None:
            line_sum = (
                select(func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0))
                .where(JournalEntryLine.journal_entry_id == JournalEntry.id)
                .correlate(JournalEntry)
                .scalar_subquery()
            )
            filters.extend(
                amount_range_filters(
                    line_sum,
                    min_amount=min_amount,
                    max_amount=max_amount,
                )
            )

        stmt = (
            select(JournalEntry)
            .where(*filters)
            .options(selectinload(JournalEntry.lines))
            .order_by(
                JournalEntry.entry_date.desc(),
                JournalEntry.created_at.desc(),
            )
        )
        entries, total = fetch_paginated(session, stmt, params)
        return [_to_journal_entry_out(entry) for entry in entries], total


def void_entry(
    session: Session,
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
    payload: VoidJournalEntryRequest,
) -> tuple[JournalEntry, JournalEntry]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    return void_journal_entry(
        session,
        entity_id,
        entry_id,
        actor_id=payload.actor_id,
        reason=payload.reason,
        void_date=payload.void_date,
    )


def correct_entry(
    session: Session,
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
    payload: CorrectJournalEntryRequest,
) -> tuple[JournalEntry, JournalEntry, JournalEntry]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        original = session.get(JournalEntry, entry_id)
        if original is None:
            raise LookupError("Journal entry not found")
        if is_subledger_backed_source(original.source):
            raise SubledgerBackedCorrectionError(resolve_correction_route(original.source))

    lines = [
        PostingLine(
            account_id=line.account_id,
            amount_kurus=line.amount_kurus,
            side=line.side,
        )
        for line in payload.lines
    ]
    return correct_journal_entry(
        session,
        entity_id,
        entry_id,
        payload.entry_date,
        payload.description,
        lines,
        actor_id=payload.actor_id,
        reason=payload.reason,
        void_date=payload.void_date,
    )
