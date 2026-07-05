"""Cash drawer request/response schemas (Decisions §14)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field
from app.core.schema_types import OptionalActorId

from app.features.cash.models import CashDrawerSessionStatus, CashMovementDirection


class CashMovementCreate(BaseModel):
    money_account_id: uuid.UUID
    movement_date: date
    direction: CashMovementDirection
    amount_kurus: int = Field(gt=0)
    offset_account_id: uuid.UUID
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class CashMovementRead(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    session_id: uuid.UUID | None
    money_account_id: uuid.UUID
    movement_date: date
    direction: CashMovementDirection
    amount_kurus: int
    offset_account_id: uuid.UUID
    description: str
    actor_id: OptionalActorId = None
    journal_entry_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class CashDrawerSessionRead(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    money_account_id: uuid.UUID
    session_date: date
    status: CashDrawerSessionStatus
    expected_balance_kurus: int | None
    counted_balance_kurus: int | None
    over_short_kurus: int | None
    closed_at: datetime | None
    closed_by: uuid.UUID | None
    close_journal_entry_id: uuid.UUID | None
    reopened_at: datetime | None = None
    reopened_by: uuid.UUID | None = None
    reopen_reason: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CashDrawerSessionDetail(CashDrawerSessionRead):
    movements: list[CashMovementRead]


class CashDrawerCloseRequest(BaseModel):
    counted_balance_kurus: int = Field(ge=0)
    actor_id: OptionalActorId = None
    description: str = Field(default="Cash drawer EOD close", max_length=512)


class CashDrawerCloseDayRequest(BaseModel):
    money_account_id: uuid.UUID
    session_date: date
    counted_balance_kurus: int = Field(ge=0)
    actor_id: OptionalActorId = None
    description: str = Field(default="Cash drawer EOD close", max_length=512)


class CashDrawerCloseResponse(BaseModel):
    session: CashDrawerSessionRead
    close_journal_entry_id: uuid.UUID | None


class CashDrawerReopenRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
