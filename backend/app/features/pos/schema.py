"""POS settlement API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class PosSettlementCreate(BaseModel):
    money_account_id: uuid.UUID
    settlement_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID


class PosSettlementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    money_account_id: uuid.UUID
    settlement_date: date
    amount_kurus: int
    description: str
    actor_id: uuid.UUID
    journal_entry_id: uuid.UUID
    reference_type: str | None
    reference_id: uuid.UUID | None
    bank_statement_line_id: uuid.UUID | None
    commission_kurus: int | None
    created_at: datetime
