"""FX purchase API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field
from app.core.schema_types import OptionalActorId

from app.core.fx.types import FxMovementType
from app.core.ledger.models import JournalEntrySource


class FxPurchaseCreate(BaseModel):
    fx_money_account_id: uuid.UUID
    try_cash_money_account_id: uuid.UUID
    native_quantity: int = Field(gt=0, description="Foreign currency amount in minor units")
    try_cost_kurus: int = Field(gt=0, description="TRY paid in kuruş")
    purchase_date: date
    description: str | None = Field(default=None, max_length=512)
    actor_id: OptionalActorId = None


class FxLedgerEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    fx_money_account_id: uuid.UUID
    movement_date: date
    movement_type: FxMovementType
    native_quantity: int
    try_cost_kurus: int
    description: str
    actor_id: OptionalActorId = None
    journal_entry_id: uuid.UUID
    journal_source: JournalEntrySource | None = None
    created_at: datetime


class FxPurchaseResponse(BaseModel):
    journal_entry_id: uuid.UUID
    fx_ledger_entry: FxLedgerEntryRead


class FxPurchaseCorrect(FxPurchaseCreate):
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class FxPurchaseCorrectOut(BaseModel):
    original_journal_entry_id: uuid.UUID
    reversal_journal_entry_id: uuid.UUID
    corrected_journal_entry_id: uuid.UUID
    fx_ledger_entry: FxLedgerEntryRead


class FxConversionCreate(BaseModel):
    fx_money_account_id: uuid.UUID
    try_money_account_id: uuid.UUID
    native_quantity: int = Field(gt=0, description="Foreign currency spent in minor units")
    try_received_kurus: int = Field(gt=0, description="TRY received in kuruş (owner-entered)")
    conversion_date: date
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None


class FxConversionResponse(BaseModel):
    journal_entry_id: uuid.UUID
    fx_ledger_entry: FxLedgerEntryRead
    try_cost_kurus: int
    realized_gain_kurus: int


class FxExpenseSpendCreate(BaseModel):
    fx_money_account_id: uuid.UUID
    expense_account_id: uuid.UUID
    native_quantity: int = Field(gt=0)
    spend_date: date
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None


class FxExpenseSpendResponse(BaseModel):
    journal_entry_id: uuid.UUID
    fx_ledger_entry: FxLedgerEntryRead
    try_cost_kurus: int


class FxBalanceRead(BaseModel):
    fx_money_account_id: uuid.UUID
    currency: str
    native_quantity: int
    try_cost_kurus: int
    gl_balance_kurus: int


class FxLedgerEntryCorrect(BaseModel):
    entry_date: date
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    native_quantity: int = Field(gt=0)
    try_received_kurus: int | None = Field(default=None, gt=0)
    expense_account_id: uuid.UUID | None = None
    fx_money_account_id: uuid.UUID | None = None
    try_money_account_id: uuid.UUID | None = None
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class FxLedgerEntryCorrectOut(BaseModel):
    original_journal_entry_id: uuid.UUID
    reversal_journal_entry_id: uuid.UUID
    corrected_journal_entry_id: uuid.UUID
    fx_ledger_entry: FxLedgerEntryRead
    try_cost_kurus: int
