"""Daily expenses request/response schemas (Decisions §7, §22)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.features.expenses.models import ExpenseEntryStatus, ExpenseReceiptIntakeStatus


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


class ExpenseAccountSuggestResponse(BaseModel):
    account_id: uuid.UUID | None = None
    source: str | None = None
    confidence: str | None = None


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


class ExpenseCorrect(ExpenseCreate):
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class ExpenseCorrectOut(BaseModel):
    original_journal_entry_id: uuid.UUID
    reversal_journal_entry_id: uuid.UUID
    corrected_journal_entry_id: uuid.UUID
    expense: ExpenseRead


class ExpenseConfirmItemRequest(BaseModel):
    expense_item_id: uuid.UUID
    actor_id: uuid.UUID


class ConfirmTipPhotoRequest(BaseModel):
    """Confirm a photo-tip draft → post Dr expense / Cr cash (Slice C).

    The OCR-read tip is editable on review: the owner may correct the amount, the
    cash/bank account it was paid from, and the date before it posts.
    """

    actor_id: uuid.UUID
    amount_kurus: int | None = Field(default=None, gt=0)
    money_account_id: uuid.UUID | None = None
    expense_date: date | None = None
    description: str | None = Field(default=None, max_length=512)
    notes: str | None = Field(default=None, max_length=512)


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
    source_document_fingerprint: str | None
    source_document_path: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExpenseReceiptLineRead(BaseModel):
    id: uuid.UUID
    line_order: int
    written_item_description: str | None
    amount_kurus: int
    expense_account_id: uuid.UUID
    review_reason: str | None
    candidate_expense_item_id: uuid.UUID | None
    expense_entry_id: uuid.UUID | None


class ExpenseReceiptRead(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    status: ExpenseReceiptIntakeStatus
    file_fingerprint: str
    source_document_path: str
    expense_date: date
    money_account_id: uuid.UUID
    receipt_total_kurus: int | None
    extraction_payload: dict
    review_reason: str | None
    actor_id: uuid.UUID
    posted_at: datetime | None
    lines: list[ExpenseReceiptLineRead]
    created_at: datetime


class ConfirmExpenseReceiptLineRequest(BaseModel):
    line_id: uuid.UUID
    written_item_description: str | None = Field(default=None, max_length=512)
    amount_kurus: int | None = Field(default=None, gt=0)
    expense_account_id: uuid.UUID | None = None
    confirm_expense_item_id: uuid.UUID | None = None


class ConfirmExpenseReceiptRequest(BaseModel):
    actor_id: uuid.UUID
    expense_date: date | None = None
    money_account_id: uuid.UUID | None = None
    lines: list[ConfirmExpenseReceiptLineRequest] | None = None


class RejectExpenseReceiptRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=512)
