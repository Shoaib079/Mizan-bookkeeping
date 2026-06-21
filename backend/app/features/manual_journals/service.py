"""Manual journal feature service — delegates to core/ledger posting boundary."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.chart_of_accounts.models import Account
from app.core.ledger.models import JournalEntry, JournalEntrySource, JournalEntryStatus
from app.core.ledger.posting import PostingLine, post_journal_entry, void_journal_entry
from app.db.session import entity_context
from app.features.entities import service as entity_service
from app.features.manual_journals.schema import (
    CreateManualJournalRequest,
    ManualJournalLineOut,
    ManualJournalOut,
    VoidJournalEntryRequest,
)


def _require_entity(session: Session, entity_id: uuid.UUID) -> None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")


def _account_map(session: Session, account_ids: set[uuid.UUID]) -> dict[uuid.UUID, Account]:
    if not account_ids:
        return {}
    accounts = list(session.scalars(select(Account).where(Account.id.in_(account_ids))))
    return {account.id: account for account in accounts}


def _to_manual_journal_out(
    entry: JournalEntry, accounts: dict[uuid.UUID, Account]
) -> ManualJournalOut:
    lines = []
    for line in entry.lines:
        account = accounts[line.account_id]
        lines.append(
            ManualJournalLineOut(
                id=line.id,
                account_id=line.account_id,
                account_code=account.code,
                account_name_en=account.name_en,
                amount_kurus=line.amount_kurus,
                side=line.side,
                line_number=line.line_number,
            )
        )
    return ManualJournalOut(
        id=entry.id,
        entity_id=entry.entity_id,
        entry_date=entry.entry_date,
        description=entry.description,
        status=entry.status,
        source=entry.source,
        reverses_entry_id=entry.reverses_entry_id,
        reversed_by_entry_id=entry.reversed_by_entry_id,
        voided_at=entry.voided_at,
        created_at=entry.created_at,
        lines=lines,
    )


def create_manual_journal(
    session: Session, entity_id: uuid.UUID, payload: CreateManualJournalRequest
) -> ManualJournalOut:
    _require_entity(session, entity_id)
    lines = [
        PostingLine(
            account_id=line.account_id,
            amount_kurus=line.amount_kurus,
            side=line.side,
        )
        for line in payload.lines
    ]
    entry = post_journal_entry(
        session,
        entity_id,
        payload.entry_date,
        payload.description,
        lines,
        actor_id=payload.actor_id,
        source=JournalEntrySource.MANUAL,
    )
    with entity_context(session, entity_id):
        accounts = _account_map(session, {line.account_id for line in entry.lines})
    return _to_manual_journal_out(entry, accounts)


def list_manual_journals(
    session: Session,
    entity_id: uuid.UUID,
    *,
    status: JournalEntryStatus | None = None,
    entry_date_from: date | None = None,
    entry_date_to: date | None = None,
) -> tuple[list[ManualJournalOut], int]:
    _require_entity(session, entity_id)

    with entity_context(session, entity_id):
        filters = [JournalEntry.source == JournalEntrySource.MANUAL]
        if status is not None:
            filters.append(JournalEntry.status == status)
        if entry_date_from is not None:
            filters.append(JournalEntry.entry_date >= entry_date_from)
        if entry_date_to is not None:
            filters.append(JournalEntry.entry_date <= entry_date_to)

        total = session.scalar(
            select(func.count()).select_from(JournalEntry).where(*filters)
        )
        entries = list(
            session.scalars(
                select(JournalEntry)
                .where(*filters)
                .options(selectinload(JournalEntry.lines))
                .order_by(
                    JournalEntry.entry_date.desc(),
                    JournalEntry.created_at.desc(),
                )
            )
        )

        account_ids = {line.account_id for entry in entries for line in entry.lines}
        accounts = _account_map(session, account_ids)

    return [_to_manual_journal_out(entry, accounts) for entry in entries], total or 0


def get_manual_journal(
    session: Session, entity_id: uuid.UUID, entry_id: uuid.UUID
) -> ManualJournalOut:
    _require_entity(session, entity_id)

    with entity_context(session, entity_id):
        entry = session.scalar(
            select(JournalEntry)
            .where(
                JournalEntry.id == entry_id,
                JournalEntry.source == JournalEntrySource.MANUAL,
            )
            .options(selectinload(JournalEntry.lines))
        )
        if entry is None:
            raise LookupError("Manual journal not found")
        accounts = _account_map(session, {line.account_id for line in entry.lines})

    return _to_manual_journal_out(entry, accounts)


def void_manual_journal(
    session: Session,
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
    payload: VoidJournalEntryRequest,
) -> tuple[ManualJournalOut, ManualJournalOut]:
    _require_entity(session, entity_id)

    with entity_context(session, entity_id):
        entry = session.get(JournalEntry, entry_id)
        if entry is None or entry.source != JournalEntrySource.MANUAL:
            raise LookupError("Manual journal not found")

    original, reversal = void_journal_entry(
        session,
        entity_id,
        entry_id,
        actor_id=payload.actor_id,
        reason=payload.reason,
        void_date=payload.void_date,
    )

    with entity_context(session, entity_id):
        account_ids = {
            line.account_id for entry in (original, reversal) for line in entry.lines
        }
        accounts = _account_map(session, account_ids)

    return (
        _to_manual_journal_out(original, accounts),
        _to_manual_journal_out(reversal, accounts),
    )
