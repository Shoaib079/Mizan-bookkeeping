"""Partner reimbursement movement types (Decisions §17)."""

from __future__ import annotations

import enum


class PartnerMovementType(str, enum.Enum):
    OPENING_BALANCE = "opening_balance"
    EXPENSE_FRONTED = "expense_fronted"
    REIMBURSEMENT_PAID = "reimbursement_paid"
    DRAWING = "drawing"
    DRAWING_REPAYMENT = "drawing_repayment"


WRITABLE_MOVEMENT_TYPES: frozenset[PartnerMovementType] = frozenset(
    {
        PartnerMovementType.EXPENSE_FRONTED,
        PartnerMovementType.REIMBURSEMENT_PAID,
        PartnerMovementType.DRAWING,
        PartnerMovementType.DRAWING_REPAYMENT,
    }
)
