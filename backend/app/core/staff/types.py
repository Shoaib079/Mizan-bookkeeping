"""Staff movement types and pay currencies (Decisions §16)."""

from __future__ import annotations

import enum


class PayCurrency(str, enum.Enum):
    TRY = "TRY"
    USD = "USD"
    EUR = "EUR"
    GBP = "GBP"


class StaffMovementType(str, enum.Enum):
    OPENING_BALANCE = "opening_balance"
    SALARY_ACCRUED = "salary_accrued"
    ADVANCE_PAID = "advance_paid"
    ADVANCE_APPLIED = "advance_applied"
    SALARY_PAYMENT = "salary_payment"


WRITABLE_MOVEMENT_TYPES: frozenset[StaffMovementType] = frozenset(
    {
        StaffMovementType.SALARY_ACCRUED,
        StaffMovementType.ADVANCE_PAID,
        StaffMovementType.SALARY_PAYMENT,
    }
)
