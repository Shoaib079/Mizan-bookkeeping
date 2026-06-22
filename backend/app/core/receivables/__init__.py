"""Receivables posting boundary (ARCHITECTURE.md)."""

from app.core.receivables.ledger import record_customer_movement
from app.core.receivables.posting import post_credit_sale, post_customer_payment

__all__ = [
    "record_customer_movement",
    "post_credit_sale",
    "post_customer_payment",
]
