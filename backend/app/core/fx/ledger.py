"""Single write boundary for FX holdings subledger (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.fx.models import FxLedgerEntry
from app.core.fx.types import FxMovementType
from app.db.session import entity_context, get_current_entity_id, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.entities import service as entity_service


class FxLedgerError(ValueError):
    """Base FX ledger validation failure."""


class ZeroFxMovementError(FxLedgerError):
    """Movement quantities must be positive."""


def record_fx_movement(
    session: Session,
    fx_money_account_id: uuid.UUID,
    *,
    movement_date: date,
    movement_type: FxMovementType,
    native_quantity: int,
    try_cost_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
) -> FxLedgerEntry:
    """Persist one FX subledger row — caller must hold entity_context and commit."""
    if movement_type == FxMovementType.PURCHASE:
        if native_quantity <= 0:
            raise ZeroFxMovementError("purchase native_quantity must be positive")
        if try_cost_kurus <= 0:
            raise ZeroFxMovementError("purchase try_cost_kurus must be positive")
    elif movement_type == FxMovementType.SPEND:
        if native_quantity >= 0:
            raise ZeroFxMovementError("spend native_quantity must be negative")
        if try_cost_kurus >= 0:
            raise ZeroFxMovementError("spend try_cost_kurus must be negative")
    else:
        raise ZeroFxMovementError(f"unsupported movement type {movement_type.value!r}")

    money_account = session.get(MoneyAccount, fx_money_account_id)
    if money_account is None:
        raise LookupError("FX money account not found")
    if money_account.account_kind != MoneyAccountKind.FOREIGN_CURRENCY:
        raise FxLedgerError("money account must be a foreign currency wallet")

    entry = FxLedgerEntry(
        fx_money_account_id=fx_money_account_id,
        movement_date=movement_date,
        movement_type=movement_type,
        native_quantity=native_quantity,
        try_cost_kurus=try_cost_kurus,
        description=description,
        actor_id=actor_id,
        journal_entry_id=journal_entry_id,
    )
    session.add(entry)
    session.flush()
    session.refresh(entry)
    return entry


def _native_quantity_balance_in_context(
    session: Session, fx_money_account_id: uuid.UUID
) -> int:
    require_entity_context()
    total = session.scalar(
        select(func.coalesce(func.sum(FxLedgerEntry.native_quantity), 0)).where(
            FxLedgerEntry.fx_money_account_id == fx_money_account_id
        )
    )
    return int(total or 0)


def _try_cost_balance_kurus_in_context(
    session: Session, fx_money_account_id: uuid.UUID
) -> int:
    require_entity_context()
    total = session.scalar(
        select(func.coalesce(func.sum(FxLedgerEntry.try_cost_kurus), 0)).where(
            FxLedgerEntry.fx_money_account_id == fx_money_account_id
        )
    )
    return int(total or 0)


def native_quantity_balance(
    session: Session, entity_id: uuid.UUID, fx_money_account_id: uuid.UUID
) -> int:
    """Sum native quantity for one FX wallet (purchases only this slice)."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    if get_current_entity_id() == entity_id:
        money_account = session.get(MoneyAccount, fx_money_account_id)
        if money_account is None:
            raise LookupError("FX money account not found")
        if money_account.account_kind != MoneyAccountKind.FOREIGN_CURRENCY:
            raise FxLedgerError("money account must be a foreign currency wallet")
        return _native_quantity_balance_in_context(session, fx_money_account_id)

    with entity_context(session, entity_id):
        money_account = session.get(MoneyAccount, fx_money_account_id)
        if money_account is None:
            raise LookupError("FX money account not found")
        if money_account.account_kind != MoneyAccountKind.FOREIGN_CURRENCY:
            raise FxLedgerError("money account must be a foreign currency wallet")
        return _native_quantity_balance_in_context(session, fx_money_account_id)


def try_cost_balance_kurus(
    session: Session, entity_id: uuid.UUID, fx_money_account_id: uuid.UUID
) -> int:
    """Sum TRY book cost on FX subledger — must match GL balance (control account)."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    if get_current_entity_id() == entity_id:
        money_account = session.get(MoneyAccount, fx_money_account_id)
        if money_account is None:
            raise LookupError("FX money account not found")
        return _try_cost_balance_kurus_in_context(session, fx_money_account_id)

    with entity_context(session, entity_id):
        money_account = session.get(MoneyAccount, fx_money_account_id)
        if money_account is None:
            raise LookupError("FX money account not found")
        return _try_cost_balance_kurus_in_context(session, fx_money_account_id)


def list_fx_ledger_entries(
    session: Session, entity_id: uuid.UUID, fx_money_account_id: uuid.UUID
) -> list[FxLedgerEntry]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        money_account = session.get(MoneyAccount, fx_money_account_id)
        if money_account is None:
            raise LookupError("FX money account not found")

        require_entity_context()
        return list(
            session.scalars(
                select(FxLedgerEntry)
                .where(FxLedgerEntry.fx_money_account_id == fx_money_account_id)
                .order_by(FxLedgerEntry.movement_date, FxLedgerEntry.created_at)
            )
        )
