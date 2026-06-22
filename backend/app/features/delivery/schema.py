"""Delivery platform report API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.delivery.platforms import DeliveryPlatform


class DeliveryReportCreate(BaseModel):
    platform: DeliveryPlatform
    report_date: date
    gross_kurus: int = Field(gt=0)
    commission_kurus: int = Field(ge=0)
    net_kurus: int = Field(ge=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID


class DeliveryReportPostRequest(BaseModel):
    actor_id: uuid.UUID
    gross_kurus: int | None = Field(default=None, gt=0)
    commission_kurus: int | None = Field(default=None, ge=0)
    net_kurus: int | None = Field(default=None, ge=0)


class DeliveryReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    platform: DeliveryPlatform
    report_date: date
    gross_kurus: int
    commission_kurus: int
    net_kurus: int
    status: str
    file_fingerprint: str
    review_reason: str | None
    description: str
    actor_id: uuid.UUID | None
    journal_entry_id: uuid.UUID | None
    posted_at: datetime | None
    posted_by: uuid.UUID | None
    created_at: datetime


class DeliveryReportListOut(BaseModel):
    items: list[DeliveryReportRead]
    total: int


class DeliverySettlementCreate(BaseModel):
    platform: DeliveryPlatform
    money_account_id: uuid.UUID
    settlement_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID
    delivery_report_id: uuid.UUID | None = None


class DeliverySettlementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    platform: DeliveryPlatform
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
    created_at: datetime


class PlatformClearingReconciliation(BaseModel):
    platform: DeliveryPlatform
    clearing_account_code: str
    clearing_balance_kurus: int
    total_reported_gross_kurus: int
    total_settled_net_kurus: int
    in_transit_kurus: int
    report_count: int
    settlement_count: int


class DeliveryClearingReconciliationRead(BaseModel):
    platforms: list[PlatformClearingReconciliation]
