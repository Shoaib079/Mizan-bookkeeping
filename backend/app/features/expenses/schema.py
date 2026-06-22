"""Daily expenses request/response schemas (Decisions §7, §22)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.features.expenses.models import ExpenseEntryStatus


class ExpenseItemCreate(BaseModel):
    canonical_name: str = Field(min_length=1, max_length=512)


class ExpenseItemRead(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    canonical_name: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ExpenseItemMergeRequest(BaseModel):
    source_id: uuid.UUID
    target_id: uuid.UUID
    actor_id: uuid.UUID


class ExpenseCreate(BaseModel):
    expense_date: date
    amount_kurus: int = Field(gt=0)
    expense_account_id: uuid.UUID
    money_account_id: uuid.UUID
    written_item_description: str | None = Field(default=None, max_length=512)
    has_source_document: bool = False
    description: str = Field(min_length=1, max_length=512)
    notes: str | None = Field(default=None, max_length=512)
    actor_id: uuid.UUID
    confirm_expense_item_id: uuid.UUID | None = None


class ExpenseConfirmItemRequest(BaseModel):
    expense_item_id: uuid.UUID
    actor_id: uuid.UUID


class ExpenseRead(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    expense_date: date
    amount_kurus: int
    expense_account_id: uuid.UUID
    money_account_id: uuid.UUID
    written_item_description: str | None
    expense_item_id: uuid.UUID | None
    status: ExpenseEntryStatus
    has_source_document: bool
    description: str
    notes: str | None
    actor_id: uuid.UUID
    journal_entry_id: uuid.UUID | None
    bank_statement_line_id: uuid.UUID | None
    review_reason: str | None
    candidate_expense_item_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
