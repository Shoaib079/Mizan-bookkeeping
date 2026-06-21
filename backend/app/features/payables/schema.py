"""Payables API schemas — Phase 2 supplier ledger."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.core.payables.types import SupplierMovementType


class SupplierPaymentCreate(BaseModel):
    payment_date: date
    amount_kurus: int
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID
    reference: str | None = Field(default=None, max_length=64)

    @field_validator("amount_kurus")
    @classmethod
    def amount_positive(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("amount_kurus must be positive")
        return value


class SupplierMovementCreate(BaseModel):
    movement_date: date
    movement_type: SupplierMovementType
    amount_kurus: int
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID

    @field_validator("amount_kurus")
    @classmethod
    def amount_non_zero(cls, value: int) -> int:
        if value == 0:
            raise ValueError("amount_kurus must be non-zero")
        return value


class SupplierLedgerEntryRead(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    supplier_id: uuid.UUID
    movement_date: date
    movement_type: SupplierMovementType
    amount_kurus: int
    description: str
    actor_id: uuid.UUID
    reference_type: str | None
    reference_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SupplierLedgerRead(BaseModel):
    supplier_id: uuid.UUID
    balance_kurus: int
    entries: list[SupplierLedgerEntryRead]


class SupplierPayableBalanceRead(BaseModel):
    supplier_id: uuid.UUID
    supplier_name: str
    vkn: str
    balance_kurus: int


class PayablesSummaryRead(BaseModel):
    total_payables_kurus: int
    suppliers: list[SupplierPayableBalanceRead]
