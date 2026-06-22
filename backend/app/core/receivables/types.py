"""Receivables ledger movement types (Decisions §10)."""

from enum import Enum


class CustomerMovementType(str, Enum):
    OPENING_BALANCE = "opening_balance"
    ADJUSTMENT = "adjustment"
    CREDIT_SALE = "credit_sale"
    PAYMENT_RECEIVED = "payment_received"


WRITABLE_MOVEMENT_TYPES: frozenset[CustomerMovementType] = frozenset(
    {CustomerMovementType.OPENING_BALANCE, CustomerMovementType.ADJUSTMENT}
)
