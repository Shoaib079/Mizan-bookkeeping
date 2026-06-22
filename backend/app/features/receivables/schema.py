"""Receivables API schemas (Decisions §10)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel


class CustomerReceivableBalanceRead(BaseModel):
    customer_id: uuid.UUID
    customer_name: str
    identifier: str | None
    balance_kurus: int


class ReceivablesSummaryRead(BaseModel):
    total_receivables_kurus: int
    customers: list[CustomerReceivableBalanceRead]
