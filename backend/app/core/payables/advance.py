"""Supplier advance (pay-first) helpers — BSF-2."""

from __future__ import annotations


def supplier_advance_kurus(current_balance_kurus: int, payment_kurus: int) -> int:
    """Kuruş of a payment that becomes supplier advance (negative AP balance)."""
    if payment_kurus <= 0:
        return 0
    if current_balance_kurus <= 0:
        return payment_kurus
    if payment_kurus > current_balance_kurus:
        return payment_kurus - current_balance_kurus
    return 0
