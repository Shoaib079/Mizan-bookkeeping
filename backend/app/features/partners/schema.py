"""Partner API schemas (Decisions §17)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.partners.types import PartnerMovementType


class PartnerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=512)
    notes: str | None = Field(default=None, max_length=2048)


class PartnerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=512)
    notes: str | None = Field(default=None, max_length=2048)
    is_active: bool | None = None


class PartnerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    is_active: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime


class PartnerLedgerEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    partner_id: uuid.UUID
    movement_date: date
    movement_type: PartnerMovementType
    amount_kurus: int
    description: str
    actor_id: uuid.UUID
    journal_entry_id: uuid.UUID | None
    created_at: datetime


class PartnerLedgerRead(BaseModel):
    partner_id: uuid.UUID
    balance_kurus: int
    entries: list[PartnerLedgerEntryRead]


class ExpenseFrontedCreate(BaseModel):
    expense_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID
    expense_account_id: uuid.UUID


class ReimbursementPaidCreate(BaseModel):
    payment_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID
    payment_account_id: uuid.UUID


class ExpenseFrontedResponse(BaseModel):
    journal_entry_id: uuid.UUID
    partner_ledger_entry: PartnerLedgerEntryRead
    balance_kurus: int


class ReimbursementPaidResponse(BaseModel):
    journal_entry_id: uuid.UUID
    partner_ledger_entry: PartnerLedgerEntryRead
    balance_kurus: int
