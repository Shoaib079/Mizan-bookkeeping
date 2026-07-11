"""Delivery platform monthly sales API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.core.schema_types import OptionalActorId

from app.core.listing.schema import PaginatedListOut


class DeliveryReportCreate(BaseModel):
    delivery_platform_id: uuid.UUID
    period_start: date
    period_end: date
    gross_kurus: int = Field(gt=0, description="Sales total for the period, KDV dahil")
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None

    @model_validator(mode="after")
    def validate_period_range(self) -> DeliveryReportCreate:
        if self.period_start > self.period_end:
            raise ValueError("period_start must be on or before period_end")
        return self


class DeliveryReportPostRequest(BaseModel):
    actor_id: OptionalActorId = None
    gross_kurus: int | None = Field(default=None, gt=0)


class DeliveryReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    delivery_platform_id: uuid.UUID
    platform_name: str
    report_date: date
    period_start: date
    period_end: date
    period_year: int
    period_month: int
    gross_kurus: int
    status: str
    file_fingerprint: str
    review_reason: str | None
    description: str
    actor_id: uuid.UUID | None
    journal_entry_id: uuid.UUID | None
    posted_at: datetime | None
    posted_by: uuid.UUID | None
    created_at: datetime


class DeliveryReportListOut(PaginatedListOut[DeliveryReportRead]):
    pass


class DeliverySettlementCreate(BaseModel):
    delivery_platform_id: uuid.UUID
    money_account_id: uuid.UUID
    settlement_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    delivery_report_id: uuid.UUID | None = None


class DeliverySettlementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    delivery_platform_id: uuid.UUID
    platform_name: str
    money_account_id: uuid.UUID
    settlement_date: date
    amount_kurus: int
    description: str
    actor_id: uuid.UUID
    journal_entry_id: uuid.UUID
    reference_type: str | None
    reference_id: uuid.UUID | None
    bank_statement_line_id: uuid.UUID | None
    delivery_report_id: uuid.UUID | None
    status: str = "posted"
    created_at: datetime


class PlatformClearingReconciliation(BaseModel):
    delivery_platform_id: uuid.UUID
    platform_name: str
    clearing_account_code: str
    is_active: bool
    clearing_balance_kurus: int
    total_reported_gross_kurus: int
    total_settled_net_kurus: int
    total_commission_posted_kurus: int
    balance_left_kurus: int
    monthly_sales_count: int
    settlement_count: int
    commission_posted_count: int


class DeliveryClearingReconciliationRead(BaseModel):
    platforms: list[PlatformClearingReconciliation]
