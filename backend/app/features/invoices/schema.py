"""Invoice draft API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field

from app.features.invoices.models import InvoiceDraftStatus, InvoiceSourceType


class VatBreakdownOut(BaseModel):
    rate_percent: float
    base_kurus: int
    vat_kurus: int


class LinkSupplierRequest(BaseModel):
    supplier_id: uuid.UUID | None = None


class ConfirmDraftRequest(BaseModel):
    actor_id: uuid.UUID


class RejectDraftRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=512)


class InvoiceDraftOut(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    status: InvoiceDraftStatus
    source_type: InvoiceSourceType
    file_fingerprint: str
    supplier_name: str | None
    supplier_vkn: str | None
    supplier_id: uuid.UUID | None = None
    linked_supplier_name: str | None = None
    linked_supplier_vkn: str | None = None
    invoice_number: str
    invoice_date: date
    net_kurus: int
    gross_kurus: int
    vat_breakdown: list[VatBreakdownOut]
    currency: str
    extraction_payload: dict[str, Any]
    review_reason: str | None = None
    confirmed_at: datetime | None = None
    confirmed_by: uuid.UUID | None = None
    created_at: datetime


class InvoiceDraftListOut(BaseModel):
    items: list[InvoiceDraftOut]
    total: int


class DuplicateDraftErrorDetail(BaseModel):
    message: str
    existing_draft_id: uuid.UUID


class InvoiceDraftDuplicateOut(BaseModel):
    detail: DuplicateDraftErrorDetail
    existing: InvoiceDraftOut
