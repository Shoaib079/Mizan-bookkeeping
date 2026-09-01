"""Pydantic schemas for payment bounce pairs."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.schema_types import OptionalActorId
from app.features.banking.schema import BankStatementLineRead


class StatementBouncePairRequest(BaseModel):
    outflow_line_id: uuid.UUID
    return_line_id: uuid.UUID
    person_type: Literal["supplier", "staff", "partner"]
    person_id: uuid.UUID
    fee_line_id: uuid.UUID | None = None
    fee_line_ids: list[uuid.UUID] | None = None
    manual_net_fee_kurus: int | None = None
    reason: str | None = Field(default=None, max_length=512)
    auto_void_confirmed: bool = False
    actor_id: OptionalActorId = None


class StatementBouncePairRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    statement_id: uuid.UUID
    person_type: str
    person_id: uuid.UUID
    outflow_line_id: uuid.UUID
    return_line_id: uuid.UUID
    fee_line_id: uuid.UUID | None
    voided_journal_entry_id: uuid.UUID | None
    actor_id: uuid.UUID
    reason: str | None
    created_at: datetime


class StatementBouncePairResult(BaseModel):
    pair: StatementBouncePairRead
    lines: list[BankStatementLineRead]
    fee_journal_entry_id: uuid.UUID | None = None
