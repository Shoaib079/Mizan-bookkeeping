"""What a partner ledger read model carries beyond its own columns.

Two facts are attached after the rows are loaded, and both are answers to
questions the row itself cannot answer:

  - the money account a movement was paid from, which lives on the journal
    entry's lines rather than on the subledger row
  - the name of whoever or whatever the row's reference points at

They were written a year apart and sat inline in `_partner_entry_reads`, which
is how that function grew a tail longer than its body. Gathered here so the
service reads as "load the rows, then enrich them", and so adding a third does
not mean editing the service at all.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy.orm import Session

from app.core.partners.row_subjects import attach_subject_names


def _attach_payment_accounts(session: Session, reads: Sequence[Any]) -> None:
    """Restore the money account a movement was paid from.

    So the edit form reopens with the account that was recorded rather than an
    empty picker. The helper only answers for entries with a single money
    line, so equity-only movements are naturally skipped.
    """
    from app.features.banking.journal_money_account import (
        money_account_gl_by_journal_entry,
    )

    journal_ids = [r.journal_entry_id for r in reads if r.journal_entry_id is not None]
    if not journal_ids:
        return
    account_by_journal = money_account_gl_by_journal_entry(session, journal_ids)
    for read in reads:
        if read.journal_entry_id in account_by_journal:
            read.payment_account_id = account_by_journal[read.journal_entry_id]


def enrich_partner_reads(
    session: Session, rows: Sequence[Any], reads: Sequence[Any]
) -> None:
    """Both enrichments, in one call, over one page of rows."""
    _attach_payment_accounts(session, reads)
    attach_subject_names(session, rows, reads)


def partner_entry_actions(session: Session, entity_id: uuid.UUID, reads: list) -> dict:
    """What may be edited or voided, for the rows about to be returned.

    Sent with the ledger so the buttons arrive with the rows. Asking
    separately was one extra round trip for work that had to happen anyway,
    and it showed: the table drew, then the actions column filled in.

    Capped at the same number the standalone route caps at — each id costs a
    subledger lookup, and a partner with a thousand movements should not be
    able to make one page request answer a thousand of them.
    """
    from app.core.ledger.entry_actions import resolve_entry_actions_for_ids
    from app.features.ledger.schema import MAX_ACTIONS_BATCH, LedgerEntryActionsOut

    ids = list(
        dict.fromkeys(
            read.journal_entry_id
            for read in reads
            if read.journal_entry_id is not None
        )
    )[:MAX_ACTIONS_BATCH]
    resolved = resolve_entry_actions_for_ids(session, entity_id, ids)
    return {
        str(entry_id): LedgerEntryActionsOut.of(a) for entry_id, a in resolved.items()
    }
