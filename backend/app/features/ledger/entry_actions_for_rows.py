"""What may be edited or voided, for a page of subledger rows.

Sent with the rows rather than fetched after them: the work is the same either
way, and asking separately made every button appear a beat after the table.

Written once because the answer is the same question for a partner, an
employee or anyone else — the rows differ, `journal_entry_id` does not. It
started life in the partner feature and the staff ledger needed exactly it,
which is the moment to move rather than copy.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy.orm import Session


def entry_actions_for_rows(
    session: Session, entity_id: uuid.UUID, reads: Sequence[Any]
) -> dict:
    """{journal entry id as a string: verdict} for the rows being returned.

    Capped at the same number the standalone route caps at — each id costs a
    subledger lookup, and one page request should not be able to ask about a
    thousand of them.
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
