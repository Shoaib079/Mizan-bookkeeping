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
