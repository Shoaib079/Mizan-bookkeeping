"""Partner reimbursement movement types (Decisions §17)."""

from __future__ import annotations

import enum


class PartnerMovementType(str, enum.Enum):
    OPENING_BALANCE = "opening_balance"
    EXPENSE_FRONTED = "expense_fronted"
    REIMBURSEMENT_PAID = "reimbursement_paid"
    DRAWING = "drawing"
    DRAWING_REPAYMENT = "drawing_repayment"
    CAPITAL_CONTRIBUTION = "capital_contribution"
    PARTNER_LOAN_RECEIVED = "partner_loan_received"
    PARTNER_LOAN_REPAID = "partner_loan_repaid"
    PROFIT_ALLOCATION = "profit_allocation"
    PROFIT_SETTLEMENT = "profit_settlement"
    PROFIT_PAID = "profit_paid"


REIMBURSEMENT_MOVEMENT_TYPES: frozenset[PartnerMovementType] = frozenset(
    {
        PartnerMovementType.OPENING_BALANCE,
        PartnerMovementType.EXPENSE_FRONTED,
        PartnerMovementType.REIMBURSEMENT_PAID,
    }
)

CAPITAL_MOVEMENT_TYPES: frozenset[PartnerMovementType] = frozenset(
    {
        PartnerMovementType.PROFIT_ALLOCATION,
        PartnerMovementType.PROFIT_SETTLEMENT,
        PartnerMovementType.PROFIT_PAID,
        PartnerMovementType.CAPITAL_CONTRIBUTION,
        PartnerMovementType.DRAWING,
        PartnerMovementType.DRAWING_REPAYMENT,
    }
)

LOAN_MOVEMENT_TYPES: frozenset[PartnerMovementType] = frozenset(
    {
        PartnerMovementType.PARTNER_LOAN_RECEIVED,
        PartnerMovementType.PARTNER_LOAN_REPAID,
    }
)

# Cash-settleable partner position (excludes permanent equity on 3300).
NET_BALANCE_MOVEMENT_TYPES: frozenset[PartnerMovementType] = frozenset(
    REIMBURSEMENT_MOVEMENT_TYPES
    | {
        PartnerMovementType.DRAWING,
        PartnerMovementType.DRAWING_REPAYMENT,
        PartnerMovementType.PROFIT_SETTLEMENT,
    }
    | LOAN_MOVEMENT_TYPES
)

WRITABLE_MOVEMENT_TYPES: frozenset[PartnerMovementType] = frozenset(
    {
        PartnerMovementType.EXPENSE_FRONTED,
        PartnerMovementType.REIMBURSEMENT_PAID,
        PartnerMovementType.DRAWING,
        PartnerMovementType.DRAWING_REPAYMENT,
        PartnerMovementType.CAPITAL_CONTRIBUTION,
        PartnerMovementType.PARTNER_LOAN_RECEIVED,
        PartnerMovementType.PARTNER_LOAN_REPAID,
        PartnerMovementType.PROFIT_ALLOCATION,
        PartnerMovementType.PROFIT_SETTLEMENT,
        PartnerMovementType.PROFIT_PAID,
    }
)
