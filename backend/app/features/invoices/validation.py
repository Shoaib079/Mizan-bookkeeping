"""Invoice draft validation — deterministic math and duplicate rules (Decisions §7)."""

from __future__ import annotations

from typing import TypedDict


class VatBreakdownLine(TypedDict):
    rate_percent: int | float
    base_kurus: int
    vat_kurus: int


class InvoiceTotalsError(ValueError):
    """Net + VAT does not equal gross (integer kuruş)."""


def validate_invoice_totals(
    net_kurus: int, gross_kurus: int, vat_breakdown: list[VatBreakdownLine]
) -> None:
    """Require sum(vat) + net == gross with zero tolerance (integer kuruş)."""
    vat_sum = sum(int(line["vat_kurus"]) for line in vat_breakdown)
    if net_kurus + vat_sum != gross_kurus:
        raise InvoiceTotalsError(
            f"net_kurus ({net_kurus}) + vat ({vat_sum}) != gross_kurus ({gross_kurus})"
        )
