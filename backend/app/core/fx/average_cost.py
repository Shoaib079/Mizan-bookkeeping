"""Average-cost FX spend calculation (Decisions §15 — no live rates)."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.fx.ledger import (
    FxLedgerError,
    native_quantity_balance,
    try_cost_balance_kurus,
)


class InsufficientFxBalanceError(FxLedgerError):
    """Spend quantity exceeds FX wallet balance."""


def compute_spend_at_average_cost(
    session: Session,
    entity_id: uuid.UUID,
    fx_money_account_id: uuid.UUID,
    spend_native: int,
) -> int:
    """TRY book cost to remove from FX GL when spending `spend_native` minor units."""
    if spend_native <= 0:
        raise ValueError("spend_native must be positive")

    total_native = native_quantity_balance(session, entity_id, fx_money_account_id)
    total_cost = try_cost_balance_kurus(session, entity_id, fx_money_account_id)

    if spend_native > total_native:
        raise InsufficientFxBalanceError(
            f"cannot spend {spend_native} — wallet holds {total_native} minor units"
        )
    if total_native <= 0 or total_cost <= 0:
        raise InsufficientFxBalanceError("FX wallet has no holdings to spend")

    if spend_native == total_native:
        return total_cost

    return (spend_native * total_cost) // total_native
