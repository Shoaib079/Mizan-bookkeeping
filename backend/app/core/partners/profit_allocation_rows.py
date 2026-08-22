"""Persist partner ledger rows for a posted profit allocation."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.core.partners import ledger as partner_ledger
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.features.partners.ledger_display_description import (
    compose_partner_post_description,
    note_from_payload,
)
from app.features.partners.models import Partner


def journal_and_partner_descriptions(
    description: str | None,
) -> tuple[str, str | None]:
    note = note_from_payload(description)
    return (note or "Profit allocation"), note


def persist_allocation_partner_rows(
    session: Session,
    *,
    allocation_date: date,
    splits: list[Any],
    partners_by_id: dict[uuid.UUID, Partner],
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    note: str | None,
) -> list[PartnerLedgerEntry]:
    partner_entries: list[PartnerLedgerEntry] = []
    for split in splits:
        partner = partners_by_id[split.partner_id]
        if split.offset_kurus > 0:
            partner_entries.append(
                partner_ledger.persist_partner_ledger_entry(
                    session,
                    split.partner_id,
                    movement_date=allocation_date,
                    movement_type=PartnerMovementType.PROFIT_SETTLEMENT,
                    amount_kurus=split.offset_kurus,
                    description=compose_partner_post_description(
                        movement_type=PartnerMovementType.PROFIT_SETTLEMENT.value,
                        partner_name=partner.name,
                        raw_note=note,
                    ),
                    actor_id=actor_id,
                    journal_entry_id=journal_entry_id,
                )
            )
        if split.amount_kurus > 0:
            partner_entries.append(
                partner_ledger.persist_partner_ledger_entry(
                    session,
                    split.partner_id,
                    movement_date=allocation_date,
                    movement_type=PartnerMovementType.PROFIT_ALLOCATION,
                    amount_kurus=split.amount_kurus,
                    description=compose_partner_post_description(
                        movement_type=PartnerMovementType.PROFIT_ALLOCATION.value,
                        partner_name=partner.name,
                        raw_note=note,
                    ),
                    actor_id=actor_id,
                    journal_entry_id=journal_entry_id,
                )
            )
    return partner_entries
