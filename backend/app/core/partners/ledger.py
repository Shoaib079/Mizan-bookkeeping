"""Single write boundary for partner reimbursement ledger (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import (
    CAPITAL_ACCOUNT_MOVEMENT_TYPES,
    CAPITAL_MOVEMENT_TYPES,
    LOAN_MOVEMENT_TYPES,
    DRAWINGS_NET_MOVEMENT_TYPES,
    NET_BALANCE_MOVEMENT_TYPES,
    PROFIT_ALLOCATED_MOVEMENT_TYPES,
    UNPAID_PROFIT_MOVEMENT_TYPES,
    REIMBURSEMENT_MOVEMENT_TYPES,
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


class OverLoanRepaymentError(PartnerLedgerError):
    """Loan repayment would exceed amount owed to partner."""


class OverProfitPaymentError(PartnerLedgerError):
    """Profit payment would exceed unpaid allocated profit."""


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


def _sum_balance(
    session: Session,
    partner_id: uuid.UUID | None,
    movement_types: frozenset[PartnerMovementType] | None = None,
    *,
    as_of: date | None = None,
) -> int:
    from app.core.ledger.subledger_effective import effective_total_for_scalars

    require_entity_context()
    stmt = select(PartnerLedgerEntry)
    if partner_id is not None:
        stmt = stmt.where(PartnerLedgerEntry.partner_id == partner_id)
    if movement_types is not None:
        stmt = stmt.where(PartnerLedgerEntry.movement_type.in_(movement_types))
    if as_of is not None:
        stmt = stmt.where(PartnerLedgerEntry.movement_date <= as_of)
    rows = session.scalars(stmt)
    return effective_total_for_scalars(
        session,
        rows,
        amount=lambda row: row.amount_kurus,
        journal_entry_id=lambda row: row.journal_entry_id,
        description=lambda row: row.description,
    )


def _balance_kurus_in_context(session: Session, partner_id: uuid.UUID) -> int:
    return _sum_balance(session, partner_id, REIMBURSEMENT_MOVEMENT_TYPES)


def reimbursement_balance_kurus(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> int:
    """Net reimbursement owed to partner (2150 subledger movements)."""
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


def capital_balance_kurus(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> int:
    """Net partner capital (3300 allocations minus drawings)."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    def _read() -> int:
        partner = session.get(Partner, partner_id)
        if partner is None:
            raise LookupError("Partner not found")
        return _sum_balance(session, partner_id, CAPITAL_MOVEMENT_TYPES)

    if get_current_entity_id() == entity_id:
        return _read()

    with entity_context(session, entity_id):
        return _read()


def _partner_balance_by_types(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    movement_types: frozenset[PartnerMovementType],
) -> int:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    def _read() -> int:
        partner = session.get(Partner, partner_id)
        if partner is None:
            raise LookupError("Partner not found")
        return _sum_balance(session, partner_id, movement_types)

    if get_current_entity_id() == entity_id:
        return _read()

    with entity_context(session, entity_id):
        return _read()


def capital_contribution_kurus(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> int:
    """Total capital contributions — permanent equity, not reduced by drawings."""
    return _partner_balance_by_types(
        session,
        entity_id,
        partner_id,
        frozenset({PartnerMovementType.CAPITAL_CONTRIBUTION}),
    )


def profit_allocated_kurus(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> int:
    """Total profit allocated to partner on 3300 (gross capital credits).

    Both halves of an allocation, not just the residual. When a partner has
    drawings outstanding, `split_profit_by_ownership` divides their share in
    two: PROFIT_SETTLEMENT for the part that clears the drawings, and
    PROFIT_ALLOCATION for whatever is left. A 100.000 ₺ share against 80.000 ₺
    of drawings posts 80.000 settlement + 20.000 allocation.

    Counting only PROFIT_ALLOCATION reported that partner as having been
    allocated 20.000 ₺, which is the cash residual, not their profit share —
    and `split_profit_by_ownership` asserts the gross amounts sum to the
    profit being distributed, so gross is what "allocated" has to mean.
    DRAWINGS_NET already treats settlement as a repayment for the same reason.
    """
    return _partner_balance_by_types(
        session,
        entity_id,
        partner_id,
        PROFIT_ALLOCATED_MOVEMENT_TYPES,
    )


def profit_settled_kurus(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> int:
    """Allocated profit that cleared drawings instead of being paid out.

    The middle term between "profit allocated" and "unpaid profit": allocated
    100.000, settled 80.000 against drawings already taken, 20.000 left to
    pay. Without it those two figures sit side by side with the difference
    unexplained.
    """
    return _partner_balance_by_types(
        session,
        entity_id,
        partner_id,
        frozenset({PartnerMovementType.PROFIT_SETTLEMENT}),
    )


def unpaid_profit_kurus(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> int:
    """Allocated profit not yet paid out in cash/bank (allocations − payments)."""
    return _partner_balance_by_types(
        session,
        entity_id,
        partner_id,
        UNPAID_PROFIT_MOVEMENT_TYPES,
    )


def drawings_net_kurus(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> int:
    """Net drawings — negative when partner has taken cash out.

    PROFIT_SETTLEMENT counts as repayment: when a profit allocation nets
    against drawings, the offset row ("Settled from profit") clears the
    outstanding drawings exactly like a cash repayment would. Without it the
    net balance zeroes but the drawings figure shows withdrawn forever.
    """
    return _partner_balance_by_types(
        session,
        entity_id,
        partner_id,
        DRAWINGS_NET_MOVEMENT_TYPES,
    )


def loan_balance_kurus(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> int:
    """Net partner loan balance — positive means the business owes the partner."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    def _read() -> int:
        partner = session.get(Partner, partner_id)
        if partner is None:
            raise LookupError("Partner not found")
        return _sum_balance(session, partner_id, LOAN_MOVEMENT_TYPES)

    if get_current_entity_id() == entity_id:
        return _read()

    with entity_context(session, entity_id):
        return _read()


def net_balance_kurus(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> int:
    """Operational partner position — cash-settleable movements only.

    Includes fronted expenses, drawings, and partner loans. Excludes permanent
    equity (capital contributions and profit allocations on 3300).

    Positive = business owes the partner; negative = partner owes the business.
    """
    return net_balance_kurus_as_of(session, entity_id, partner_id, as_of=None)


def net_balance_kurus_as_of(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    as_of: date | None,
) -> int:
    """Net balance including only movements on or before ``as_of`` (inclusive).

    When ``as_of`` is None, all effective movements count (same as net_balance_kurus).
    Used when allocating profit for a period — drawings after period end are ignored.
    """
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    def _read() -> int:
        partner = session.get(Partner, partner_id)
        if partner is None:
            raise LookupError("Partner not found")
        return _sum_balance(
            session, partner_id, NET_BALANCE_MOVEMENT_TYPES, as_of=as_of
        )

    if get_current_entity_id() == entity_id:
        return _read()

    with entity_context(session, entity_id):
        return _read()


def current_balance_kurus(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> int:
    """Reimbursement balance — alias for expense/reimbursement flows."""
    return reimbursement_balance_kurus(session, entity_id, partner_id)


def entity_reimbursement_total_kurus(session: Session, entity_id: uuid.UUID) -> int:
    """Sum partner reimbursement subledger for 2150 control-account tie."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        return _sum_balance(session, None, REIMBURSEMENT_MOVEMENT_TYPES)


def entity_capital_total_kurus(session: Session, entity_id: uuid.UUID) -> int:
    """Subledger side of the 3300 control-account tie.

    Sums exactly the movements that post to partner capital — see
    `CAPITAL_ACCOUNT_MOVEMENT_TYPES` for why that is three types and not the
    six in `CAPITAL_MOVEMENT_TYPES`.
    """
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        return _sum_balance(session, None, CAPITAL_ACCOUNT_MOVEMENT_TYPES)


def entity_total_balance_kurus(session: Session, entity_id: uuid.UUID) -> int:
    """Sum partner reimbursement subledger balances (2150 tie)."""
    return entity_reimbursement_total_kurus(session, entity_id)


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
