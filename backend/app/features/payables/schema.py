"""Payables API schemas — Phase 2 supplier ledger."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator
from app.core.schema_types import OptionalActorId

from app.core.ledger.subledger_display import SubledgerDisplayKind
from app.core.payables.types import SupplierMovementType


class SupplierPaymentCreate(BaseModel):
    payment_date: date
    amount_kurus: int
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    payment_account_id: uuid.UUID
    reference: str | None = Field(default=None, max_length=64)
    confirm_advance: bool = False

    @field_validator("amount_kurus")
    @classmethod
    def amount_positive(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("amount_kurus must be positive")
        return value


class SupplierPaymentCorrect(SupplierPaymentCreate):
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class SupplierMovementCreate(BaseModel):
    movement_date: date
    movement_type: SupplierMovementType
    amount_kurus: int
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None

    @field_validator("amount_kurus")
    @classmethod
    def amount_non_zero(cls, value: int) -> int:
        if value == 0:
            raise ValueError("amount_kurus must be non-zero")
        return value


class SupplierLedgerEntryRead(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    supplier_id: uuid.UUID
    movement_date: date
    movement_type: SupplierMovementType
    amount_kurus: int
    description: str
    actor_id: OptionalActorId = None
    reference_type: str | None
    reference_id: uuid.UUID | None
    journal_entry_id: uuid.UUID | None
    # GL account id of the money account this payment was paid from (restored
    # from the journal entry) — lets the edit form reopen with the recorded one.
    payment_account_id: uuid.UUID | None = None
    created_at: datetime
    display_kind: SubledgerDisplayKind = SubledgerDisplayKind.EFFECTIVE
    was_corrected: bool = False

    model_config = {"from_attributes": True}


class SupplierLedgerRead(BaseModel):
    supplier_id: uuid.UUID
    balance_kurus: int
    entries: list[SupplierLedgerEntryRead]


class SupplierPayableBalanceRead(BaseModel):
    supplier_id: uuid.UUID
    supplier_name: str
    vkn: str
    balance_kurus: int


class SupplierPaymentRead(BaseModel):
    journal_entry_id: uuid.UUID
    supplier_ledger_entry: SupplierLedgerEntryRead
    payable_balance_kurus: int


class SupplierPaymentCorrectOut(BaseModel):
    original_journal_entry_id: uuid.UUID
    reversal_journal_entry_id: uuid.UUID
    corrected_journal_entry_id: uuid.UUID
    supplier_ledger_entry: SupplierLedgerEntryRead
    payable_balance_kurus: int


class VatBreakdownIn(BaseModel):
    rate_percent: float
    base_kurus: int
    vat_kurus: int


class SupplierInvoiceCorrect(BaseModel):
    invoice_date: date
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    expense_account_id: uuid.UUID
    net_kurus: int = Field(gt=0)
    gross_kurus: int = Field(gt=0)
    vat_breakdown: list[VatBreakdownIn] = Field(min_length=1)
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class SupplierInvoiceCorrectOut(BaseModel):
    original_journal_entry_id: uuid.UUID
    reversal_journal_entry_id: uuid.UUID
    corrected_journal_entry_id: uuid.UUID
    supplier_ledger_entry: SupplierLedgerEntryRead
    payable_balance_kurus: int


class PayablesSummaryRead(BaseModel):
    total_payables_kurus: int
    suppliers: list[SupplierPayableBalanceRead]
    total: int
    limit: int
    offset: int


class SupplierActivityRow(BaseModel):
    movement_date: date
    movement_kind: str
    movement_label: str
    document_ref: str
    detail: str
    net_kurus: int | None = None
    vat_kurus: int | None = None
    amount_kurus: int | None = None
    bank_name: str | None = None
    dekont_ref: str | None = None
    balance_kurus: int
    affects_balance: bool = True
    invoice_draft_id: uuid.UUID | None = None
    journal_entry_id: uuid.UUID | None = None
    has_document: bool = False
    can_edit: bool = False
    expense_account_id: uuid.UUID | None = None
    # GL account a payment was paid from — restores the edit form's picker.
    payment_account_id: uuid.UUID | None = None
    display_kind: SubledgerDisplayKind = SubledgerDisplayKind.EFFECTIVE
    was_corrected: bool = False


class SupplierActivityRead(BaseModel):
    supplier_id: uuid.UUID
    supplier_name: str
    supplier_vkn: str
    from_date: date
    to_date: date
    opening_balance_kurus: int
    closing_balance_kurus: int
    total_invoices_gross_kurus: int
    total_payments_kurus: int
    total_vat_kurus: int
    rows: list[SupplierActivityRow]
