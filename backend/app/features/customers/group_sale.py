"""Group credit sale description + amount helpers."""

from __future__ import annotations

from app.features.customers.schema import CreditSaleCreate


def build_group_credit_sale_description(payload: CreditSaleCreate) -> str:
    base = payload.description.strip()
    if payload.pax is None:
        return base
    parts = [base]
    if payload.rate_per_person_kurus is not None:
        parts.append(f"{payload.pax} pax × ₺{payload.rate_per_person_kurus / 100:,.2f}")
    if (
        payload.forex_currency
        and payload.rate_per_person_forex_minor is not None
        and payload.total_forex_minor is not None
    ):
        major = payload.total_forex_minor / 100
        parts.append(
            f"{payload.forex_currency} {major:,.2f} "
            f"({payload.pax} × {payload.rate_per_person_forex_minor / 100:,.2f})"
        )
    return " — ".join(parts)


def resolve_credit_sale_amount_kurus(payload: CreditSaleCreate) -> int:
    if payload.pax is not None and payload.rate_per_person_kurus is not None:
        return payload.pax * payload.rate_per_person_kurus
    return payload.amount_kurus
