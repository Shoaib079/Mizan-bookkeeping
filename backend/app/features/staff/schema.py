"""Staff API schemas (Decisions §16)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.core.schema_types import OptionalActorId, AcknowledgeDuplicateMixin

from app.core.ledger.subledger_display import SubledgerDisplayKind
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
    actor_id: OptionalActorId = None
    journal_entry_id: uuid.UUID | None
    period_year: int | None = None
    period_month: int | None = None
    extra_days: int | None = None
    created_at: datetime
    display_kind: SubledgerDisplayKind = SubledgerDisplayKind.EFFECTIVE
    was_corrected: bool = False


class StaffLedgerRead(BaseModel):
    employee_id: uuid.UUID
    balance_minor: int
    remaining_accrual_minor: int
    outstanding_advance_minor: int
    entries: list[StaffLedgerEntryRead]


class StaffAccrualCreate(AcknowledgeDuplicateMixin):
    accrual_date: date
    amount_minor: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    period_year: int = Field(ge=2000, le=2100)
    period_month: int = Field(ge=1, le=12)

    @field_validator("period_month")
    @classmethod
    def validate_period_month(cls, value: int) -> int:
        if not 1 <= value <= 12:
            raise ValueError("period_month must be 1–12")
        return value


class StaffAdvanceCreate(AcknowledgeDuplicateMixin):
    payment_date: date
    amount_minor: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    payment_account_id: uuid.UUID | None = None
    fx_money_account_id: uuid.UUID | None = None
    try_cost_kurus: int | None = Field(default=None, gt=0)


class StaffExtraDaysPaidCreate(AcknowledgeDuplicateMixin):
    payment_date: date
    extra_days: int = Field(gt=0, le=31)
    per_day_minor: int = Field(gt=0)
    description: str | None = Field(default=None, max_length=512)
    actor_id: OptionalActorId = None
    payment_account_id: uuid.UUID | None = None


class StaffExtraDaysPaidResponse(BaseModel):
    journal_entry_id: uuid.UUID
    staff_ledger_entry: StaffLedgerEntryRead
    balance_minor: int
    total_minor: int


class StaffPaymentCreate(AcknowledgeDuplicateMixin):
    payment_date: date
    amount_minor: int = Field(ge=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    payment_account_id: uuid.UUID | None = None
    fx_money_account_id: uuid.UUID | None = None
    try_cost_kurus: int | None = Field(default=None, gt=0)
    period_year: int = Field(ge=2000, le=2100)
    period_month: int = Field(ge=1, le=12)
    period_salary_minor: int = Field(
        gt=0,
        description="Month salary total — accrues at pay time if not already recorded",
    )

    @field_validator("period_month")
    @classmethod
    def validate_period_month(cls, value: int) -> int:
        if not 1 <= value <= 12:
            raise ValueError("period_month must be 1–12")
        return value


class SalaryPeriodStatusRead(BaseModel):
    employee_id: uuid.UUID
    period_year: int
    period_month: int
    period_salary_minor: int
    period_paid_minor: int
    period_remaining_minor: int
    outstanding_advance_minor: int


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
    advance_applied_minor: int = 0
    fx_ledger_entry_id: uuid.UUID | None = None


class StaffJournalEntryCorrect(BaseModel):
    entry_date: date
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    amount_minor: int | None = Field(default=None, gt=0)
    try_cost_kurus: int | None = Field(default=None, gt=0)
    payment_account_id: uuid.UUID | None = None
    fx_money_account_id: uuid.UUID | None = None
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class StaffJournalEntryCorrectOut(BaseModel):
    original_journal_entry_id: uuid.UUID
    reversal_journal_entry_id: uuid.UUID
    corrected_journal_entry_id: uuid.UUID
    staff_ledger_entry: StaffLedgerEntryRead
    balance_minor: int
