"""Invoice draft API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field
from app.core.schema_types import OptionalActorId

from app.core.listing.schema import PaginatedListOut
from app.features.invoices.models import InvoiceDraftStatus, InvoiceKind, InvoiceSourceType
from app.core.ledger.models import JournalEntrySource


class VatBreakdownOut(BaseModel):
    rate_percent: float
    base_kurus: int
    vat_kurus: int


class LinkSupplierRequest(BaseModel):
    supplier_id: uuid.UUID | None = None


class LinkDeliveryPlatformRequest(BaseModel):
    delivery_platform_id: uuid.UUID


class ConfirmDraftRequest(BaseModel):
    actor_id: OptionalActorId = None


class RejectDraftRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=512)


class UnconfirmDraftRequest(BaseModel):
    actor_id: OptionalActorId = None
    reason: str | None = Field(default=None, max_length=512)


class SetInvoiceKindRequest(BaseModel):
    invoice_kind: InvoiceKind


class PostInvoiceDraftRequest(BaseModel):
    actor_id: OptionalActorId = None
    expense_account_id: uuid.UUID


class ConfirmAndPostInvoiceDraftRequest(BaseModel):
    actor_id: OptionalActorId = None
    expense_account_id: uuid.UUID


class PostInvoiceDraftOut(BaseModel):
    draft: InvoiceDraftOut
    journal_entry_id: uuid.UUID
    journal_entry_date: date
    journal_entry_description: str
    journal_entry_source: JournalEntrySource
    supplier_ledger_entry_id: uuid.UUID | None = None
    payable_balance_kurus: int | None = None
    delivery_platform_id: uuid.UUID | None = None


class InvoiceDraftOut(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    status: InvoiceDraftStatus
    invoice_kind: InvoiceKind
    source_type: InvoiceSourceType
    file_fingerprint: str
    supplier_name: str | None
    supplier_vkn: str | None
    supplier_id: uuid.UUID | None = None
    delivery_platform_id: uuid.UUID | None = None
    linked_supplier_name: str | None = None
    linked_supplier_vkn: str | None = None
    linked_platform_name: str | None = None
    invoice_number: str
    referenced_invoice_number: str | None = None
    referenced_invoice_date: date | None = None
    invoice_date: date
    net_kurus: int
    gross_kurus: int
    other_taxes_kurus: int = 0
    vat_breakdown: list[VatBreakdownOut]
    currency: str
    extraction_payload: dict[str, Any]
    review_reason: str | None = None
    classification_confidence: Literal["high", "medium", "low"] | None = None
    confirmed_at: datetime | None = None
    confirmed_by: uuid.UUID | None = None
    posted_at: datetime | None = None
    posted_by: uuid.UUID | None = None
    journal_entry_id: uuid.UUID | None = None
    created_at: datetime
    has_stored_document: bool = False
    suggested_expense_account_id: uuid.UUID | None = None
    expense_account_confidence: Literal["high", "medium", "low"] | None = None
    one_click_post_eligible: bool = False
    posted_by_rule_auto: bool = False


class InvoiceDraftListOut(PaginatedListOut[InvoiceDraftOut]):
    pass


class DuplicateDraftErrorDetail(BaseModel):
    message: str
    existing_draft_id: uuid.UUID


class InvoiceDraftDuplicateOut(BaseModel):
    detail: DuplicateDraftErrorDetail
    existing: InvoiceDraftOut
