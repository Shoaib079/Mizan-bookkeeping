"""Ledger API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntryStatus


class PostingLineIn(BaseModel):
    account_id: uuid.UUID
    amount_kurus: int = Field(gt=0)
    side: AccountNormalBalance


class PostJournalEntryRequest(BaseModel):
    entry_date: date
    description: str = Field(max_length=512)
    lines: list[PostingLineIn] = Field(min_length=2)
    actor_id: uuid.UUID


class VoidJournalEntryRequest(BaseModel):
    actor_id: uuid.UUID
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None


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
    status: JournalEntryStatus
    reverses_entry_id: uuid.UUID | None
    reversed_by_entry_id: uuid.UUID | None
    voided_at: datetime | None
    created_at: datetime
    lines: list[JournalEntryLineOut]

    model_config = {"from_attributes": True}


class VoidJournalEntryOut(BaseModel):
    original: JournalEntryOut
    reversal: JournalEntryOut
