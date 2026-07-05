"""Customer API schemas (Decisions §10)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field
from app.core.schema_types import OptionalActorId

from app.core.receivables.types import CustomerMovementType


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=512)
    identifier: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=2048)


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=512)
    identifier: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=2048)
    is_active: bool | None = None


class CustomerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    identifier: str | None
    is_active: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime


class CustomerLedgerEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    movement_date: date
    movement_type: CustomerMovementType
    amount_kurus: int
    description: str
    actor_id: OptionalActorId = None
    journal_entry_id: uuid.UUID | None
    created_at: datetime


class CustomerLedgerRead(BaseModel):
    customer_id: uuid.UUID
    balance_kurus: int
    entries: list[CustomerLedgerEntryRead]


class CreditSaleCreate(BaseModel):
    sale_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    revenue_account_id: uuid.UUID | None = None


class CustomerPaymentCreate(BaseModel):
    payment_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    payment_account_id: uuid.UUID


class CreditSaleResponse(BaseModel):
    journal_entry_id: uuid.UUID
    customer_ledger_entry: CustomerLedgerEntryRead
    balance_kurus: int


class CustomerPaymentResponse(BaseModel):
    journal_entry_id: uuid.UUID
    customer_ledger_entry: CustomerLedgerEntryRead
    balance_kurus: int


class CustomerPaymentCorrect(CustomerPaymentCreate):
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class CustomerPaymentCorrectOut(BaseModel):
    original_journal_entry_id: uuid.UUID
    reversal_journal_entry_id: uuid.UUID
    corrected_journal_entry_id: uuid.UUID
    customer_ledger_entry: CustomerLedgerEntryRead
    balance_kurus: int


class CreditSaleCorrect(CreditSaleCreate):
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class CreditSaleCorrectOut(BaseModel):
    original_journal_entry_id: uuid.UUID
    reversal_journal_entry_id: uuid.UUID
    corrected_journal_entry_id: uuid.UUID
    customer_ledger_entry: CustomerLedgerEntryRead
    balance_kurus: int
