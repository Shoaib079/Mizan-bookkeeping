"""Receivables API schemas (Decisions §10)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel

from app.features.customers.schema import ForexOutstanding


class CustomerReceivableBalanceRead(BaseModel):
    customer_id: uuid.UUID
    customer_name: str
    identifier: str | None
    balance_kurus: int
    # What they owe in the currency they agreed to pay in, when that is not
    # lira. Empty for the ordinary case, so existing clients are unaffected.
    # A currency they have overpaid comes back negative.
    outstanding_by_currency: list[ForexOutstanding] = []


class ReceivablesSummaryRead(BaseModel):
    total_receivables_kurus: int
    customers: list[CustomerReceivableBalanceRead]
    total: int
    limit: int
    offset: int
