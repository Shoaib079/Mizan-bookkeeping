"""Single write boundary for partner reimbursement ledger (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import (
    WRITABLE_MOVEMENT_TYPES,
    PartnerMovementType,
)
from app.db.session import entity_context, get_current_entity_id, require_entity_context
from app.features.entities import service as entity_service
from app.features.partners.models import Partner


class PartnerLedgerError(ValueError):
    """Base partner ledger validation failure."""


class ZeroMovementError(PartnerLedgerError):
    """Movement amount must be non-zero."""


class DisallowedMovementTypeError(PartnerLedgerError):
    """Movement type not allowed in this slice."""


class OverpaymentError(PartnerLedgerError):
    """Reimbursement would exceed amount owed to partner."""


class OverRepaymentError(PartnerLedgerError):
    """Drawing repayment would exceed amount owed by partner."""


def persist_partner_opening_entry(
    session: Session,
    partner_id: uuid.UUID,
    *,
    movement_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    reference_type: str,
    reference_id: uuid.UUID,
) -> PartnerLedgerEntry:
    """Persist opening balance partner movement without commit — caller holds entity_context."""
    if amount_kurus <= 0:
        raise ZeroMovementError("Opening balance amount_kurus must be positive")

    partner = session.get(Partner, partner_id)
    if partner is None:
        raise LookupError("Partner not found")

    entry = PartnerLedgerEntry(
        partner_id=partner_id,
        movement_date=movement_date,
        movement_type=PartnerMovementType.OPENING_BALANCE,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
        journal_entry_id=journal_entry_id,
        reference_type=reference_type,
        reference_id=reference_id,
    )
    session.add(entry)
    session.flush()
    session.refresh(entry)
    return entry


def persist_partner_ledger_entry(
    session: Session,
    partner_id: uuid.UUID,
    *,
    movement_date: date,
    movement_type: PartnerMovementType,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID | None = None,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> PartnerLedgerEntry:
    """Persist one partner subledger row — caller must hold entity_context."""
    if amount_kurus == 0:
        raise ZeroMovementError("amount_kurus must be non-zero")

    partner = session.get(Partner, partner_id)
    if partner is None:
        raise LookupError("Partner not found")

    entry = PartnerLedgerEntry(
        partner_id=partner_id,
        movement_date=movement_date,
        movement_type=movement_type,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
        journal_entry_id=journal_entry_id,
        reference_type=reference_type,
        reference_id=reference_id,
    )
    session.add(entry)
    session.flush()
    session.refresh(entry)
    return entry


def record_partner_movement(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    movement_date: date,
    movement_type: PartnerMovementType,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> PartnerLedgerEntry:
    """Direct subledger write — posting functions should be preferred for GL events."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    if amount_kurus == 0:
        raise ZeroMovementError("amount_kurus must be non-zero")

    if movement_type not in WRITABLE_MOVEMENT_TYPES:
        raise DisallowedMovementTypeError(
            f"movement type {movement_type.value!r} is not writable in this slice"
        )

    with entity_context(session, entity_id):
        partner = session.get(Partner, partner_id)
        if partner is None:
            raise LookupError("Partner not found")

        entry = PartnerLedgerEntry(
            partner_id=partner_id,
            movement_date=movement_date,
            movement_type=movement_type,
            amount_kurus=amount_kurus,
            description=description,
            actor_id=actor_id,
            reference_type=reference_type,
            reference_id=reference_id,
        )
        session.add(entry)
        session.commit()
        session.refresh(entry)
        return entry


def _balance_kurus_in_context(session: Session, partner_id: uuid.UUID) -> int:
    require_entity_context()
    total = session.scalar(
        select(func.coalesce(func.sum(PartnerLedgerEntry.amount_kurus), 0)).where(
            PartnerLedgerEntry.partner_id == partner_id
        )
    )
    return int(total or 0)


def current_balance_kurus(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> int:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    if get_current_entity_id() == entity_id:
        partner = session.get(Partner, partner_id)
        if partner is None:
            raise LookupError("Partner not found")
        return _balance_kurus_in_context(session, partner_id)

    with entity_context(session, entity_id):
        partner = session.get(Partner, partner_id)
        if partner is None:
            raise LookupError("Partner not found")
        return _balance_kurus_in_context(session, partner_id)


def entity_total_balance_kurus(session: Session, entity_id: uuid.UUID) -> int:
    """Sum partner subledger balances for control-account reconciliation."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        total = session.scalar(
            select(func.coalesce(func.sum(PartnerLedgerEntry.amount_kurus), 0))
        )
        return int(total or 0)


def list_ledger_entries(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> list[PartnerLedgerEntry]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        partner = session.get(Partner, partner_id)
        if partner is None:
            raise LookupError("Partner not found")

        require_entity_context()
        return list(
            session.scalars(
                select(PartnerLedgerEntry)
                .where(PartnerLedgerEntry.partner_id == partner_id)
                .order_by(
                    PartnerLedgerEntry.movement_date,
                    PartnerLedgerEntry.created_at,
                )
            )
        )
