"""FX purchase API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.fx.types import FxMovementType


class FxPurchaseCreate(BaseModel):
    fx_money_account_id: uuid.UUID
    try_cash_money_account_id: uuid.UUID
    native_quantity: int = Field(gt=0, description="Foreign currency amount in minor units")
    try_cost_kurus: int = Field(gt=0, description="TRY paid in kuruş")
    purchase_date: date
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID


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
    actor_id: uuid.UUID
    journal_entry_id: uuid.UUID
    created_at: datetime


class FxPurchaseResponse(BaseModel):
    journal_entry_id: uuid.UUID
    fx_ledger_entry: FxLedgerEntryRead


class FxConversionCreate(BaseModel):
    fx_money_account_id: uuid.UUID
    try_money_account_id: uuid.UUID
    native_quantity: int = Field(gt=0, description="Foreign currency spent in minor units")
    try_received_kurus: int = Field(gt=0, description="TRY received in kuruş (owner-entered)")
    conversion_date: date
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID


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
    actor_id: uuid.UUID


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
