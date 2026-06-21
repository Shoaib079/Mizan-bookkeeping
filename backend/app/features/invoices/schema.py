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


class InvoiceDraftOut(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    status: InvoiceDraftStatus
    source_type: InvoiceSourceType
    file_fingerprint: str
    supplier_name: str | None
    supplier_vkn: str | None
    invoice_number: str
    invoice_date: date
    net_kurus: int
    gross_kurus: int
    vat_breakdown: list[VatBreakdownOut]
    currency: str
    extraction_payload: dict[str, Any]
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
