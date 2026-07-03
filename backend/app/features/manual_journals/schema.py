"""Manual journal API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.listing.schema import PaginatedListOut
from app.core.ledger.models import JournalEntrySource, JournalEntryStatus
from app.features.ledger.schema import PostingLineIn, VoidJournalEntryRequest


class CreateManualJournalRequest(BaseModel):
    entry_date: date | None = None
    description: str = Field(max_length=512)
    lines: list[PostingLineIn] = Field(min_length=2)
    actor_id: uuid.UUID | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class ManualJournalLineOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    account_code: str
    account_name_en: str
    amount_kurus: int
    side: AccountNormalBalance
    line_number: int


class ManualJournalOut(BaseModel):
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
    lines: list[ManualJournalLineOut]


class ManualJournalListOut(PaginatedListOut[ManualJournalOut]):
    pass


class ManualJournalVoidOut(BaseModel):
    original: ManualJournalOut
    reversal: ManualJournalOut


__all__ = [
    "CreateManualJournalRequest",
    "ManualJournalLineOut",
    "ManualJournalListOut",
    "ManualJournalOut",
    "ManualJournalVoidOut",
    "VoidJournalEntryRequest",
]
