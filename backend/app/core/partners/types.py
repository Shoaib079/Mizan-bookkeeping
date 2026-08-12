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

# Profit credited to the partner, less what has been paid out of it.
UNPAID_PROFIT_MOVEMENT_TYPES: frozenset[PartnerMovementType] = frozenset(
    {PartnerMovementType.PROFIT_ALLOCATION, PartnerMovementType.PROFIT_PAID}
)

# The partner's whole share, both halves of it: the part that cleared drawings
# on the day it was allocated, and the residual credited to them.
PROFIT_ALLOCATED_MOVEMENT_TYPES: frozenset[PartnerMovementType] = frozenset(
    {PartnerMovementType.PROFIT_ALLOCATION, PartnerMovementType.PROFIT_SETTLEMENT}
)

# Drawings, net of what has cleared them — repayments in cash, and the profit
# settlement rows, which clear outstanding drawings exactly as a repayment does.
DRAWINGS_NET_MOVEMENT_TYPES: frozenset[PartnerMovementType] = frozenset(
    {
        PartnerMovementType.DRAWING,
        PartnerMovementType.DRAWING_REPAYMENT,
        PartnerMovementType.PROFIT_SETTLEMENT,
    }
)

# What the partner is owed, or owes, today — for reading.
#
# NET_BALANCE_MOVEMENT_TYPES plus the profit credited to them and not yet paid.
# A partner reading their ledger does the subtraction in their head: "you
# allocated me 68.763,91 and I took 80.800, so I owe 12.036,09". The app held
# those as two figures and never brought them together, so it announced a debt
# of 80.800 while separately owing them 68.763,91.
#
# Deliberately a second set rather than widening the one above.
# NET_BALANCE_MOVEMENT_TYPES decides how much of a *new* allocation settles
# outstanding drawings (`split_profit_by_ownership`). Folding already-allocated
# profit into that would make a partner look less overdrawn than they are and
# settle less than it should — a change to what gets posted, not to what is
# read. The two questions look alike and are not the same one.
#
# Capital contributions stay out of both, and that is the point of keeping them
# apart: money put into the business is not a debt it repays on demand.
CURRENT_ACCOUNT_MOVEMENT_TYPES: frozenset[PartnerMovementType] = frozenset(
    NET_BALANCE_MOVEMENT_TYPES | UNPAID_PROFIT_MOVEMENT_TYPES
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
