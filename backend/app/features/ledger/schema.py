"""Ledger API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field
from app.core.schema_types import OptionalActorId

from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntrySource, JournalEntryStatus
from app.core.listing.schema import PaginatedListOut


class PostingLineIn(BaseModel):
    account_id: uuid.UUID
    amount_kurus: int = Field(gt=0)
    side: AccountNormalBalance


class PostJournalEntryRequest(BaseModel):
    entry_date: date | None = None
    description: str = Field(max_length=512)
    lines: list[PostingLineIn] = Field(min_length=2)
    actor_id: OptionalActorId = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class VoidJournalEntryRequest(BaseModel):
    actor_id: OptionalActorId = None
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class CorrectJournalEntryRequest(BaseModel):
    entry_date: date
    description: str = Field(max_length=512)
    lines: list[PostingLineIn] = Field(min_length=2)
    actor_id: OptionalActorId = None
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


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
    source: JournalEntrySource
    reverses_entry_id: uuid.UUID | None
    reversed_by_entry_id: uuid.UUID | None
    amends_entry_id: uuid.UUID | None
    amended_by_entry_id: uuid.UUID | None
    voided_at: datetime | None
    created_at: datetime
    lines: list[JournalEntryLineOut]

    model_config = {"from_attributes": True}


class VoidJournalEntryOut(BaseModel):
    original: JournalEntryOut
    reversal: JournalEntryOut


class SubledgerVoidOut(BaseModel):
    original_journal_entry_id: uuid.UUID
    reversal_journal_entry_id: uuid.UUID


class CorrectJournalEntryOut(BaseModel):
    original: JournalEntryOut
    reversal: JournalEntryOut
    corrected: JournalEntryOut


class JournalEntryListOut(PaginatedListOut[JournalEntryOut]):
    pass
