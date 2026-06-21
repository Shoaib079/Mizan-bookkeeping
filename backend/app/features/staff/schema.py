"""Staff API schemas (Decisions §16)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.staff.types import PayCurrency, StaffMovementType


class EmployeeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=512)
    pay_currency: PayCurrency = PayCurrency.TRY
    notes: str | None = Field(default=None, max_length=2048)


class EmployeeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=512)
    notes: str | None = Field(default=None, max_length=2048)
    is_active: bool | None = None


class EmployeeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    pay_currency: PayCurrency
    is_active: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime


class StaffLedgerEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    movement_date: date
    movement_type: StaffMovementType
    amount_minor: int
    try_cost_kurus: int | None
    description: str
    actor_id: uuid.UUID
    journal_entry_id: uuid.UUID | None
    created_at: datetime


class StaffLedgerRead(BaseModel):
    employee_id: uuid.UUID
    balance_minor: int
    entries: list[StaffLedgerEntryRead]


class StaffAccrualCreate(BaseModel):
    accrual_date: date
    amount_minor: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID


class StaffAdvanceCreate(BaseModel):
    payment_date: date
    amount_minor: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID
    payment_account_id: uuid.UUID | None = None
    fx_money_account_id: uuid.UUID | None = None
    try_cost_kurus: int | None = Field(default=None, gt=0)


class StaffPaymentCreate(BaseModel):
    payment_date: date
    amount_minor: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID
    payment_account_id: uuid.UUID | None = None
    fx_money_account_id: uuid.UUID | None = None
    try_cost_kurus: int | None = Field(default=None, gt=0)


class StaffAccrualResponse(BaseModel):
    journal_entry_id: uuid.UUID | None
    staff_ledger_entry: StaffLedgerEntryRead
    balance_minor: int


class StaffAdvanceResponse(BaseModel):
    journal_entry_id: uuid.UUID
    staff_ledger_entry: StaffLedgerEntryRead
    balance_minor: int
    fx_ledger_entry_id: uuid.UUID | None = None


class StaffPaymentResponse(BaseModel):
    journal_entry_id: uuid.UUID
    staff_ledger_entry: StaffLedgerEntryRead
    balance_minor: int
    fx_ledger_entry_id: uuid.UUID | None = None
