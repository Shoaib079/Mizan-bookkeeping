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
    }
)
