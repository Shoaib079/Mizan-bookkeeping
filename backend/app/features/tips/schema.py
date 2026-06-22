"""Tips pass-through request/response schemas (Decisions §9)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

from app.features.tips.models import TipAccrualSource


class TipAccrualCreate(BaseModel):
    accrual_date: date
    amount_kurus: int = Field(gt=0)
    source: TipAccrualSource
    money_account_id: uuid.UUID | None = None
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID

    @model_validator(mode="after")
    def validate_money_account_for_source(self) -> TipAccrualCreate:
        if self.source == TipAccrualSource.CASH and self.money_account_id is None:
            raise ValueError("money_account_id required for cash tip accrual")
        if self.source == TipAccrualSource.CARD and self.money_account_id is not None:
            raise ValueError("money_account_id not allowed for card tip accrual")
        return self


class TipAccrualRead(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    accrual_date: date
    amount_kurus: int
    source: TipAccrualSource
    money_account_id: uuid.UUID | None
    description: str
    actor_id: uuid.UUID
    journal_entry_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class TipPayoutCreate(BaseModel):
    payout_date: date
    amount_kurus: int = Field(gt=0)
    money_account_id: uuid.UUID
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID


class TipPayoutRead(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    payout_date: date
    amount_kurus: int
    money_account_id: uuid.UUID
    description: str
    actor_id: uuid.UUID
    journal_entry_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class TipsBalanceRead(BaseModel):
    balance_kurus: int
