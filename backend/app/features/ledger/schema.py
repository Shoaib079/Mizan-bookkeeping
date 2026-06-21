"""Ledger API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.core.chart_of_accounts.types import AccountNormalBalance


class PostingLineIn(BaseModel):
    account_id: uuid.UUID
    amount_kurus: int = Field(gt=0)
    side: AccountNormalBalance


class PostJournalEntryRequest(BaseModel):
    entry_date: date
    description: str = Field(max_length=512)
    lines: list[PostingLineIn] = Field(min_length=2)


class JournalEntryLineOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    amount_kurus: int
    side: AccountNormalBalance
    line_number: int

    model_config = {"from_attributes": True}


class JournalEntryOut(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    entry_date: date
    description: str
    created_at: datetime
    lines: list[JournalEntryLineOut]

    model_config = {"from_attributes": True}
