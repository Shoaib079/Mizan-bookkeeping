"""POS settlement API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field
from app.core.schema_types import OptionalActorId

from app.core.listing.schema import PaginatedListOut


class CardSalesBatchCreate(BaseModel):
    sales_date: date
    gross_amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None


class CardSalesBatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: str = "posted"
    id: uuid.UUID
    entity_id: uuid.UUID
    sales_date: date
    gross_amount_kurus: int
    description: str
    actor_id: OptionalActorId = None
    journal_entry_id: uuid.UUID
    created_at: datetime


class PosSettlementCreate(BaseModel):
    money_account_id: uuid.UUID
    settlement_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
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
    actor_id: OptionalActorId = None
    journal_entry_id: uuid.UUID
    reference_type: str | None
    reference_id: uuid.UUID | None
    bank_statement_line_id: uuid.UUID | None
    commission_kurus: int | None
    commission_inferred: bool
    card_sales_batch_id: uuid.UUID | None
    status: str = "posted"
    created_at: datetime


class ClearingAgingBucket(BaseModel):
    label: str
    amount_kurus: int


class ClearingReconciliationRead(BaseModel):
    clearing_balance_kurus: int
    total_card_sales_kurus: int
    total_settled_gross_kurus: int
    in_transit_kurus: int
    card_sales_batch_count: int
    pos_settlement_count: int
    # Period roll-forward for the selected date range: opening in-transit +
    # card sales − clearances (deposits + sweeps) = closing in-transit.
    period_from: date | None = None
    period_to: date | None = None
    opening_in_transit_kurus: int = 0
    period_card_sales_kurus: int = 0
    period_clearances_kurus: int = 0
    closing_in_transit_kurus: int = 0
    # Commission already recognised in 5310 (statement lines + sweeps) in range,
    # so the sweep is visibly aware of commission you already recorded.
    commission_recorded_kurus: int = 0
    # Age of the current (cumulative) undeposited clearing balance.
    aging: list[ClearingAgingBucket] = Field(default_factory=list)


class CardCommissionClearanceRequest(BaseModel):
    actor_id: OptionalActorId = None
    clearance_date: date | None = None
    description: str | None = Field(default=None, max_length=512)
    # Set true to proceed past the large-amount safety guard.
    confirm: bool = False


class CardCommissionClearanceRead(BaseModel):
    commission_kurus: int
    clearing_balance_before_kurus: int
    clearing_balance_after_kurus: int
    clearance_date: date
    journal_entry_id: uuid.UUID


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
    z_report_kurus: int | None
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
    actor_id: OptionalActorId = None
    cash_kurus: int | None = Field(default=None, ge=0)
    card_kurus: int | None = Field(default=None, ge=0)
    summary_date: date | None = None
    description: str | None = Field(default=None, max_length=512)
    # Card-terminal Z-report total. When the entity has Z reconciliation enabled,
    # Z must match the system card sale before posting; mismatch → Needs Review.
    z_report_kurus: int | None = Field(default=None, ge=0)


class CorrectPosDailySummaryRequest(ConfirmPosDailySummaryRequest):
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class RejectPosDailySummaryRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=512)


class ManualDailySalesRequest(BaseModel):
    sales_date: date
    cash_kurus: int = Field(ge=0)
    card_kurus: int = Field(ge=0)
    money_account_id: uuid.UUID
    actor_id: OptionalActorId = None
    description: str | None = Field(default=None, max_length=512)
    z_report_kurus: int | None = Field(default=None, ge=0)
