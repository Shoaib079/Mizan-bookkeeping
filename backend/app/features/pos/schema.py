"""POS settlement API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.listing.schema import PaginatedListOut


class CardSalesBatchCreate(BaseModel):
    sales_date: date
    gross_amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID


class CardSalesBatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    sales_date: date
    gross_amount_kurus: int
    description: str
    actor_id: uuid.UUID
    journal_entry_id: uuid.UUID
    created_at: datetime


class PosSettlementCreate(BaseModel):
    money_account_id: uuid.UUID
    settlement_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID
    commission_kurus: int | None = Field(default=None, ge=0)
    card_sales_batch_id: uuid.UUID | None = None


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
    commission_inferred: bool
    card_sales_batch_id: uuid.UUID | None
    created_at: datetime


class ClearingReconciliationRead(BaseModel):
    clearing_balance_kurus: int
    total_card_sales_kurus: int
    total_settled_gross_kurus: int
    in_transit_kurus: int
    card_sales_batch_count: int
    pos_settlement_count: int


class PosDailySummaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    status: str
    file_fingerprint: str
    summary_date: date | None
    cash_kurus: int
    card_kurus: int
    total_kurus: int
    tips_kurus: int = 0
    confirmed_cash_kurus: int | None
    confirmed_card_kurus: int | None
    extraction_payload: dict
    review_reason: str | None
    money_account_id: uuid.UUID | None
    confirmed_at: datetime | None
    confirmed_by: uuid.UUID | None
    posted_at: datetime | None
    posted_by: uuid.UUID | None
    card_sales_batch_id: uuid.UUID | None
    cash_movement_id: uuid.UUID | None
    created_at: datetime


class PosDailySummaryListOut(PaginatedListOut[PosDailySummaryRead]):
    pass


class ConfirmPosDailySummaryRequest(BaseModel):
    money_account_id: uuid.UUID
    actor_id: uuid.UUID
    cash_kurus: int | None = Field(default=None, ge=0)
    card_kurus: int | None = Field(default=None, ge=0)
    summary_date: date | None = None
    description: str | None = Field(default=None, max_length=512)


class RejectPosDailySummaryRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=512)
