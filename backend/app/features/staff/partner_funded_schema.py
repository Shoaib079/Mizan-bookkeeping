"""Schemas for partner-funded staff salary (TRY only)."""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.schema_types import AcknowledgeDuplicateMixin, OptionalActorId
from app.features.staff.schema import StaffLedgerEntryRead


class PartnerFundedSalaryCreate(AcknowledgeDuplicateMixin):
    payment_date: date
    amount_minor: int = Field(gt=0)
    partner_id: uuid.UUID
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    period_year: int = Field(ge=2000, le=2100)
    period_month: int = Field(ge=1, le=12)
    period_salary_minor: int = Field(gt=0)
    extra_days: int | None = Field(default=None, gt=0, le=31)
    per_day_minor: int | None = Field(default=None, gt=0)

    @field_validator("period_month")
    @classmethod
    def validate_period_month(cls, value: int) -> int:
        if not 1 <= value <= 12:
            raise ValueError("period_month must be 1–12")
        return value

    @model_validator(mode="after")
    def extra_days_pair(self) -> "PartnerFundedSalaryCreate":
        if (self.extra_days is None) ^ (self.per_day_minor is None):
            raise ValueError("extra_days and per_day_minor must be sent together")
        return self


class PartnerFundedSalaryResponse(BaseModel):
    journal_entry_id: uuid.UUID
    staff_ledger_entry: StaffLedgerEntryRead
    partner_ledger_entry_id: uuid.UUID
    partner_id: uuid.UUID
    balance_minor: int
    partner_balance_kurus: int
    advance_applied_minor: int = 0
