"""Supplier invoice edit — resolve correctable journal entry and expense account."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import JournalEntry, JournalEntryStatus
from app.core.ledger.posting import AlreadyVoidedError, EntryNotFoundError, NotVoidableError
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType


class InvoiceEditError(ValueError):
    """Invoice cannot be edited from this journal entry."""


def expense_account_id_from_journal(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry: JournalEntry,
) -> uuid.UUID | None:
    """Debit line on an expense GL account (excludes input VAT)."""
    for line in journal_entry.lines:
        account = session.get(Account, line.account_id)
        if (
            account is None
            or account.entity_id != entity_id
            or account.account_type != AccountType.EXPENSE
            or line.side != AccountNormalBalance.DEBIT
        ):
            continue
        return account.id
    return None


def resolve_supplier_invoice_edit_target(
    session: Session,
    journal_entry_id: uuid.UUID,
) -> uuid.UUID:
    """Follow void/amend chain to the journal entry that should be edited."""
    entry = session.get(JournalEntry, journal_entry_id)
    if entry is None:
        raise EntryNotFoundError(f"journal entry {journal_entry_id} not found")

    if entry.reverses_entry_id is not None:
        original = session.get(JournalEntry, entry.reverses_entry_id)
        if original is not None and original.amended_by_entry_id is not None:
            return original.amended_by_entry_id
        raise NotVoidableError(
            "Reversal entries cannot be edited — use Edit on the current posted invoice"
        )

    if entry.status == JournalEntryStatus.VOIDED:
        if entry.amended_by_entry_id is not None:
            return entry.amended_by_entry_id
        raise AlreadyVoidedError(
            "This invoice was voided — edit the replacement entry instead"
        )

    return entry.id


def supplier_invoice_row_is_editable(
    session: Session,
    entry: SupplierLedgerEntry,
    *,
    draft_journal_entry_id: uuid.UUID | None,
) -> bool:
    if entry.movement_type != SupplierMovementType.INVOICE:
        return False
    if entry.journal_entry_id is None:
        return False

    journal = session.get(JournalEntry, entry.journal_entry_id)
    if journal is None:
        return False
    if journal.reverses_entry_id is not None:
        return False
    if journal.status != JournalEntryStatus.POSTED:
        return False
    if draft_journal_entry_id is not None and draft_journal_entry_id != journal.id:
        return False
    return True
