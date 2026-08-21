"""Stamp supplier activity rows with entry_actions Edit/Void verdicts."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.ledger.entry_actions import resolve_entry_actions_for_ids
from app.core.ledger.subledger_display import SubledgerDisplayKind
from app.features.payables.schema import SupplierActivityRow


def stamp_activity_capabilities(
    session: Session,
    entity_id: uuid.UUID,
    rows: list[SupplierActivityRow],
) -> None:
    """Offer Edit/Void only as entry_actions decides — not a second opinion.

    Non-effective rows (void reversal / superseded) get nothing even if the
    journal is still POSTED (a reversal is), so the activity column matches
    what the GL would show for a live movement.
    """
    je_ids = [
        r.journal_entry_id
        for r in rows
        if r.journal_entry_id is not None
        and r.display_kind == SubledgerDisplayKind.EFFECTIVE
    ]
    if not je_ids:
        return
    resolved = resolve_entry_actions_for_ids(session, entity_id, je_ids)
    for row in rows:
        if (
            row.journal_entry_id is None
            or row.display_kind != SubledgerDisplayKind.EFFECTIVE
        ):
            row.can_edit = False
            row.can_void = False
            row.void_path = None
            continue
        actions = resolved.get(row.journal_entry_id)
        if actions is None:
            row.can_edit = False
            row.can_void = False
            row.void_path = None
            continue
        row.can_edit = actions.can_edit
        row.can_void = actions.can_void
        row.void_path = actions.void_path
