"""Ordered registry of ledger repair recipes."""

from __future__ import annotations

from app.core.ledger.repairs.profit_allocation_v3 import (
    REPAIR_KEY as PROFIT_ALLOCATION_V3_KEY,
    apply_profit_allocation_v3,
)
from app.core.ledger.repairs.types import RepairReport, RepairSpec


def _apply_profit_allocation_v3(session, entity_id) -> RepairReport:
    details = apply_profit_allocation_v3(session, entity_id)
    return RepairReport(repair_key=PROFIT_ALLOCATION_V3_KEY, details=details)


REPAIR_REGISTRY: tuple[RepairSpec, ...] = (
    RepairSpec(
        key=PROFIT_ALLOCATION_V3_KEY,
        description=(
            "Void+repost partner profit allocations to full Dr 3100 / Cr 3200 "
            "settlement + Cr 3300 capital with PROFIT_SETTLEMENT subledger rows."
        ),
        apply=_apply_profit_allocation_v3,
    ),
)


def all_repair_specs() -> tuple[RepairSpec, ...]:
    return REPAIR_REGISTRY
