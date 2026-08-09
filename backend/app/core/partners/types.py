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

# The movements that actually reach GL 3300, and so the ones the control
# account tie must sum. Narrower than CAPITAL_MOVEMENT_TYPES above, which is
# the *category* a movement belongs to — a drawing is capital business but it
# posts to owner drawings, and a profit settlement credits owner drawings too
# (see `build_profit_allocation_lines`: only the residual `amount_kurus` is
# credited to partner capital). Neither one touches 3300.
#
# This existed as a hand-written pair inside `entity_capital_total_kurus` that
# listed the two credits and forgot the debit, so every profit payment made the
# subledger look 220.000 ₺ richer than the account it is supposed to mirror.
# Named and placed here because the answer is a property of the posting code,
# not of whoever happens to be writing a query.
CAPITAL_ACCOUNT_MOVEMENT_TYPES: frozenset[PartnerMovementType] = frozenset(
    {
        PartnerMovementType.CAPITAL_CONTRIBUTION,
        PartnerMovementType.PROFIT_ALLOCATION,
        PartnerMovementType.PROFIT_PAID,
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
