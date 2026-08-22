"""Read-time FX ledger description enrichment (display-only)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.fx.models import FxLedgerEntry
from app.core.fx.types import FxMovementType
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.fx.ledger_display_description import (
    _is_bare_note,
    append_owner_note,
    build_fx_conversion_description,
    build_fx_purchase_description,
    build_fx_spend_description,
    owner_note_from_stored,
)
from app.features.fx.schema import FxLedgerEntryRead


def _try_cash_for_purchase(
    session: Session,
    journal_entry_id: uuid.UUID | None,
    fx_gl_id: uuid.UUID | None,
    gl_to_money: dict[uuid.UUID, MoneyAccount],
) -> MoneyAccount | None:
    if journal_entry_id is None:
        return None
    line_accounts = session.scalars(
        select(JournalEntryLine.account_id).where(
            JournalEntryLine.journal_entry_id == journal_entry_id,
            JournalEntryLine.account_id.in_(set(gl_to_money.keys())),
        )
    ).all()
    others = {a for a in line_accounts if a != fx_gl_id}
    if len(others) != 1:
        return None
    return gl_to_money.get(next(iter(others)))


def _try_received_from_journal(
    session: Session,
    journal_entry_id: uuid.UUID | None,
    fx_gl_id: uuid.UUID | None,
    money_by_gl: dict[uuid.UUID, MoneyAccount],
) -> int | None:
    if journal_entry_id is None:
        return None
    lines = session.scalars(
        select(JournalEntryLine).where(
            JournalEntryLine.journal_entry_id == journal_entry_id
        )
    ).all()
    total = 0
    found = False
    for line in lines:
        if line.side != AccountNormalBalance.DEBIT:
            continue
        account = money_by_gl.get(line.account_id)
        if account is None:
            continue
        if fx_gl_id is not None and line.account_id == fx_gl_id:
            continue
        if account.account_kind == MoneyAccountKind.FOREIGN_CURRENCY:
            continue
        total += line.amount_kurus
        found = True
    return total if found else None


def reads_for_fx_ledger(
    session: Session,
    entries: Sequence[FxLedgerEntry],
    *,
    entity_id: uuid.UUID,
    to_ledger_read,
) -> list[FxLedgerEntryRead]:
    """Build FX ledger reads and apply rich descriptions."""
    from app.core.ledger.models import JournalEntry

    reads: list[FxLedgerEntryRead] = []
    for entry in entries:
        journal = session.get(JournalEntry, entry.journal_entry_id)
        reads.append(to_ledger_read(session, entry, entity_id=entity_id, journal=journal))
    apply_fx_ledger_descriptions(session, entries, reads, entity_id=entity_id)
    return reads


def apply_fx_ledger_descriptions(
    session: Session,
    entries: Sequence[FxLedgerEntry],
    reads: Sequence[FxLedgerEntryRead],
    *,
    entity_id: uuid.UUID,
) -> None:
    """Overwrite FX read-model descriptions (display-only)."""
    del entity_id
    if not entries or not reads:
        return

    account_ids = {entry.fx_money_account_id for entry in entries}
    wallets = {
        ma.id: ma
        for ma in session.scalars(select(MoneyAccount).where(MoneyAccount.id.in_(account_ids)))
    }
    all_money = list(session.scalars(select(MoneyAccount)))
    gl_to_money = {ma.gl_account_id: ma for ma in all_money if ma.gl_account_id}

    je_ids = {e.journal_entry_id for e in entries if e.journal_entry_id is not None}
    journals = (
        {
            j.id: j
            for j in session.scalars(select(JournalEntry).where(JournalEntry.id.in_(je_ids)))
        }
        if je_ids
        else {}
    )

    entry_by_id = {entry.id: entry for entry in entries}
    for read in reads:
        entry = entry_by_id.get(read.id)
        if entry is None:
            continue
        wallet = wallets.get(entry.fx_money_account_id)
        currency = (wallet.currency if wallet and wallet.currency else "FX").upper()
        fx_gl = wallet.gl_account_id if wallet else None
        stored = entry.description or ""
        qty = abs(entry.native_quantity)
        journal = journals.get(entry.journal_entry_id) if entry.journal_entry_id else None
        source = journal.source if journal is not None else None

        if entry.movement_type == FxMovementType.PURCHASE or source == JournalEntrySource.FX_PURCHASE:
            cash = _try_cash_for_purchase(
                session, entry.journal_entry_id, fx_gl, gl_to_money
            )
            cash_name = cash.name if cash is not None else "cash"
            body = build_fx_purchase_description(
                native_quantity=qty,
                currency=currency,
                try_cost_kurus=abs(entry.try_cost_kurus),
                cash_account_name=cash_name,
                note=None,
            )
            read.description = append_owner_note(
                body, owner_note_from_stored(stored, body)
            )
            continue

        if source == JournalEntrySource.FX_CONVERSION:
            received = _try_received_from_journal(
                session, entry.journal_entry_id, fx_gl, gl_to_money
            )
            if received is None:
                received = abs(entry.try_cost_kurus)
            body = build_fx_conversion_description(
                native_quantity=qty,
                currency=currency,
                try_received_kurus=received,
                note=None,
            )
            read.description = append_owner_note(
                body, owner_note_from_stored(stored, body)
            )
            continue

        if (
            source == JournalEntrySource.FX_EXPENSE_SPEND
            or entry.movement_type == FxMovementType.SPEND
        ):
            expense: str | None = None
            if stored and not _is_bare_note(stored):
                if stored.startswith("FX spend ·"):
                    body = build_fx_spend_description(
                        native_quantity=qty,
                        currency=currency,
                        expense_description=None,
                        note=None,
                    )
                    read.description = append_owner_note(
                        body, owner_note_from_stored(stored, body)
                    )
                    continue
                expense = stored
            read.description = build_fx_spend_description(
                native_quantity=qty,
                currency=currency,
                expense_description=expense,
                note=None,
            )
