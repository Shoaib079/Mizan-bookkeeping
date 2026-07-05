"""Day close-out request/response schemas (Phase 11 Slice 11.15)."""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, Field
from app.core.schema_types import OptionalActorId


class DayCloseoutExpenseLine(BaseModel):
    amount_kurus: int = Field(gt=0)
    expense_account_id: uuid.UUID
    item_description: str | None = Field(default=None, max_length=512)


class DayCloseoutRequest(BaseModel):
    sales_date: date
    cash_kurus: int = Field(ge=0)
    card_kurus: int = Field(ge=0)
    money_account_id: uuid.UUID
    actor_id: OptionalActorId = None
    z_report_kurus: int | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=512)
    period_unlock_reason: str | None = Field(default=None, max_length=512)
    expense_lines: list[DayCloseoutExpenseLine] = Field(default_factory=list)


class DayCloseoutExpensePosted(BaseModel):
    expense_id: uuid.UUID
    journal_entry_id: uuid.UUID


class DayCloseoutRead(BaseModel):
    pos_daily_summary_id: uuid.UUID
    pos_daily_summary_status: str
    card_journal_entry_id: uuid.UUID | None
    cash_journal_entry_id: uuid.UUID | None
    expenses: list[DayCloseoutExpensePosted]
