"""Period lock API schemas — Phase 8.5 Slice 4."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.core.period_locks.models import PeriodLockKind


class ClosePeriodLockRequest(BaseModel):
    lock_kind: PeriodLockKind
    anchor_date: date
    reason: str | None = Field(default=None, max_length=512)


class ReopenPeriodLockRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=512)


class PeriodLockOut(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    lock_kind: PeriodLockKind
    period_start: date
    period_end: date
    closed_at: datetime
    closed_by: uuid.UUID
    reopened_at: datetime | None
    reopened_by: uuid.UUID | None
    dirty: bool

    model_config = {"from_attributes": True}


class PeriodLockListOut(BaseModel):
    items: list[PeriodLockOut]


class ChangedEntryOut(BaseModel):
    journal_entry_id: uuid.UUID
    entry_date: date
    description: str
    source: str
    status: str
    amount_kurus: int
    changed_at: datetime
    #: "posted" (new entry in the month), "voided" (an original removed) or
    #: "reversal" (the void's other half).
    change_kind: str
    reverses_entry_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}


class UnlockReasonOut(BaseModel):
    actor_id: uuid.UUID
    reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SealedMonthChangesOut(BaseModel):
    lock_id: uuid.UUID
    period_start: date
    period_end: date
    closed_at: datetime
    dirty: bool
    entries: list[ChangedEntryOut]
    #: Reasons given for writing into the sealed month, newest first. Not
    #: joined to the entries — the guard records them before the entry exists.
    reasons: list[UnlockReasonOut]

    model_config = {"from_attributes": True}


class YearEndLineOut(BaseModel):
    account_id: uuid.UUID
    code: str
    name: str
    account_type: str
    balance_kurus: int

    model_config = {"from_attributes": True}


class YearEndPreviewOut(BaseModel):
    year: int
    closing_date: date
    revenue_total_kurus: int
    expense_total_kurus: int
    net_result_kurus: int
    lines: list[YearEndLineOut]
    already_closed: bool
    journal_entry_id: uuid.UUID | None = None
    #: False while December is still open — you can't close a year over a month
    #: that might still change.
    december_closed: bool = False
    can_close: bool = False

    model_config = {"from_attributes": True}


class CloseYearRequest(BaseModel):
    year: int = Field(ge=2000, le=2200)
    description: str | None = Field(default=None, max_length=512)


class ReadinessCheckOut(BaseModel):
    key: str
    label: str
    severity: str
    passed: bool
    detail: str = ""
    count: int = 0
    amount_kurus: int | None = None
    href: str | None = None

    model_config = {"from_attributes": True}


class MonthCloseReadinessOut(BaseModel):
    year: int
    month: int
    period_start: date
    period_end: date
    checks: list[ReadinessCheckOut]
    #: False when a blocking check failed — the month can't be closed yet.
    can_close: bool
    warning_count: int
    #: Set when this month has already been closed and not reopened.
    existing_lock: PeriodLockOut | None = None
