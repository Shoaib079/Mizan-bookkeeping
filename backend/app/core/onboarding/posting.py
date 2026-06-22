"""Opening balance posting — single GL + supplier subledger boundary (Decisions §19)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntry, JournalEntrySource, JournalEntryStatus
from app.core.ledger.posting import PostingLine, prepare_journal_entry
from app.core.partners.ledger import persist_partner_opening_entry
from app.core.payables.ledger import persist_supplier_opening_entry
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.entities.models import EntitySetting
from app.features.onboarding.opening_balances import (
    OpeningBalanceLineInput,
    chart_is_seeded,
    resolve_opening_balance_posting,
)


class OpeningBalancePostError(ValueError):
    """Opening balance post failed."""


class ChartNotSeededError(OpeningBalancePostError):
    """Entity chart must be seeded before posting opening balances."""


class AlreadyPostedError(OpeningBalancePostError):
    """Opening balances were already posted for this entity."""


@dataclass(frozen=True, slots=True)
class SupplierOpeningEntrySummary:
    id: uuid.UUID
    supplier_id: uuid.UUID
    journal_entry_id: uuid.UUID
    amount_kurus: int


@dataclass(frozen=True, slots=True)
class PartnerOpeningEntrySummary:
    id: uuid.UUID
    partner_id: uuid.UUID
    journal_entry_id: uuid.UUID
    amount_kurus: int


@dataclass(frozen=True, slots=True)
class OpeningBalancePostResult:
    journal_entry: JournalEntry
    supplier_ledger_entries: list[SupplierOpeningEntrySummary]
    partner_ledger_entries: list[PartnerOpeningEntrySummary]


def _opening_balance_already_posted(session: Session) -> bool:
    existing_id = session.scalar(
        select(JournalEntry.id)
        .where(
            JournalEntry.source == JournalEntrySource.OPENING_BALANCE,
            JournalEntry.status == JournalEntryStatus.POSTED,
        )
        .limit(1)
    )
    return existing_id is not None


def _store_go_live_date(session: Session, go_live_date: date) -> None:
    """Persist go-live date — caller must hold entity_context."""
    setting = session.scalar(
        select(EntitySetting).where(EntitySetting.key == "go_live_date")
    )
    value = go_live_date.isoformat()
    if setting is None:
        session.add(EntitySetting(key="go_live_date", value=value))
    else:
        setting.value = value


def post_opening_balances(
    session: Session,
    entity_id: uuid.UUID,
    *,
    go_live_date: date,
    lines: list[OpeningBalanceLineInput],
    actor_id: uuid.UUID,
) -> OpeningBalancePostResult:
    """Post day-one opening balance journal with optional supplier subledger rows."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    if not chart_is_seeded(session, entity_id):
        raise ChartNotSeededError(
            "Chart of accounts must be seeded before posting opening balances"
        )

    with entity_context(session, entity_id):
        require_entity_context()

        if _opening_balance_already_posted(session):
            raise AlreadyPostedError(
                "Opening balances have already been posted for this entity"
            )

        journal_drafts, supplier_lines, partner_lines = resolve_opening_balance_posting(
            session, entity_id, lines
        )

        posting_lines = [
            PostingLine(
                account_id=draft.account_id,
                amount_kurus=draft.amount_kurus,
                side=draft.side,
            )
            for draft in journal_drafts
            if draft.account_id is not None
        ]

        description = "Opening balances"
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            go_live_date,
            description,
            posting_lines,
            actor_id=actor_id,
            source=JournalEntrySource.OPENING_BALANCE,
        )

        supplier_summaries: list[SupplierOpeningEntrySummary] = []
        for supplier_line in supplier_lines:
            supplier_entry = persist_supplier_opening_entry(
                session,
                supplier_line.supplier_id,
                movement_date=go_live_date,
                amount_kurus=supplier_line.amount_kurus,
                description=description,
                actor_id=actor_id,
                journal_entry_id=journal_entry.id,
                reference_type="opening_balance",
                reference_id=journal_entry.id,
            )
            supplier_summaries.append(
                SupplierOpeningEntrySummary(
                    id=supplier_entry.id,
                    supplier_id=supplier_entry.supplier_id,
                    journal_entry_id=supplier_entry.journal_entry_id,
                    amount_kurus=supplier_entry.amount_kurus,
                )
            )

        partner_summaries: list[PartnerOpeningEntrySummary] = []
        for partner_line in partner_lines:
            partner_entry = persist_partner_opening_entry(
                session,
                partner_line.partner_id,
                movement_date=go_live_date,
                amount_kurus=partner_line.amount_kurus,
                description=description,
                actor_id=actor_id,
                journal_entry_id=journal_entry.id,
                reference_type="opening_balance",
                reference_id=journal_entry.id,
            )
            partner_summaries.append(
                PartnerOpeningEntrySummary(
                    id=partner_entry.id,
                    partner_id=partner_entry.partner_id,
                    journal_entry_id=partner_entry.journal_entry_id,
                    amount_kurus=partner_entry.amount_kurus,
                )
            )

        _store_go_live_date(session, go_live_date)

        session.commit()
        session.refresh(journal_entry)
        _ = list(journal_entry.lines)

        return OpeningBalancePostResult(
            journal_entry=journal_entry,
            supplier_ledger_entries=supplier_summaries,
            partner_ledger_entries=partner_summaries,
        )
