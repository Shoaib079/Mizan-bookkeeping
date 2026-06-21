"""Payables ledger movement types (Decisions §8)."""

from enum import Enum


class SupplierMovementType(str, Enum):
    OPENING_BALANCE = "opening_balance"
    ADJUSTMENT = "adjustment"
    INVOICE = "invoice"
    PAYMENT = "payment"
    CREDIT_NOTE = "credit_note"


WRITABLE_MOVEMENT_TYPES: frozenset[SupplierMovementType] = frozenset(
    {SupplierMovementType.OPENING_BALANCE, SupplierMovementType.ADJUSTMENT}
)
