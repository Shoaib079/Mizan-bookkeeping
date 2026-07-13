"""Restore which money account a payment used, from its journal entry.

Subledger payment rows (customer/supplier/staff/partner) store the amount and
FX detail but not the bank/cash/FX account the money moved through — that lives
only on the payment's journal entry. Edit forms need it so they can reopen a
payment showing the account it was actually recorded against (cash as cash, a
USD wallet as USD) instead of defaulting to the first account in the list.

This maps each journal entry to the GL account id of its money-account line —
the same id the edit-form account pickers use as their value.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntryLine
from app.features.banking.models import MoneyAccount


def money_account_gl_by_journal_entry(
    session: Session,
    journal_entry_ids: Iterable[uuid.UUID],
) -> dict[uuid.UUID, uuid.UUID]:
    """Map journal_entry_id -> GL account id of its money-account line.

    Only entries that touch exactly one money account (the normal case for a
    payment: Dr/Cr bank|cash|FX against the subledger control account) get an
    entry. Must be called inside the entity RLS context.
    """
    ids = [je for je in journal_entry_ids if je is not None]
    if not ids:
        return {}

    money_gl_ids = set(session.scalars(select(MoneyAccount.gl_account_id)).all())
    if not money_gl_ids:
        return {}

    rows = session.execute(
        select(JournalEntryLine.journal_entry_id, JournalEntryLine.account_id).where(
            JournalEntryLine.journal_entry_id.in_(ids),
            JournalEntryLine.account_id.in_(money_gl_ids),
        )
    ).all()

    # One money line per payment entry; if an entry unexpectedly has more than
    # one, drop it (ambiguous) rather than guess.
    result: dict[uuid.UUID, uuid.UUID] = {}
    seen_multiple: set[uuid.UUID] = set()
    for je_id, account_id in rows:
        if je_id in result:
            seen_multiple.add(je_id)
        else:
            result[je_id] = account_id
    for je_id in seen_multiple:
        result.pop(je_id, None)
    return result
