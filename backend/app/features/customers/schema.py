"""Customer API schemas (Decisions §10)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.core.schema_types import OptionalActorId, AcknowledgeDuplicateMixin

from app.core.ledger.subledger_display import SubledgerDisplayKind
from app.core.receivables.types import CustomerMovementType
from app.features.customers.validation import validate_optional_tax_id

SUPPORTED_GROUP_FOREX = frozenset({"USD", "EUR", "GBP"})


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=512)
    identifier: str | None = Field(default=None, max_length=64)
    tax_id: str | None = Field(default=None, max_length=11)
    contact_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    notes: str | None = Field(default=None, max_length=2048)

    @field_validator("tax_id")
    @classmethod
    def check_tax_id(cls, value: str | None) -> str | None:
        return validate_optional_tax_id(value)


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=512)
    identifier: str | None = Field(default=None, max_length=64)
    tax_id: str | None = Field(default=None, max_length=11)
    contact_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    notes: str | None = Field(default=None, max_length=2048)
    is_active: bool | None = None

    @field_validator("tax_id")
    @classmethod
    def check_tax_id(cls, value: str | None) -> str | None:
        return validate_optional_tax_id(value)


class CustomerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    identifier: str | None
    tax_id: str | None
    contact_name: str | None
    phone: str | None
    is_active: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime


class CustomerLedgerEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    movement_date: date
    movement_type: CustomerMovementType
    amount_kurus: int
    description: str
    pax: int | None = None
    rate_per_person_kurus: int | None = None
    forex_currency: str | None = None
    rate_per_person_forex_minor: int | None = None
    total_forex_minor: int | None = None
    payment_native_quantity: int | None = None
    actor_id: OptionalActorId = None
    journal_entry_id: uuid.UUID | None
    created_at: datetime
    display_kind: SubledgerDisplayKind = SubledgerDisplayKind.EFFECTIVE
    was_corrected: bool = False


class CustomerLedgerRead(BaseModel):
    customer_id: uuid.UUID
    balance_kurus: int
    entries: list[CustomerLedgerEntryRead]


class CreditSaleCreate(AcknowledgeDuplicateMixin):
    sale_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    revenue_account_id: uuid.UUID | None = None
    pax: int | None = Field(default=None, gt=0)
    rate_per_person_kurus: int | None = Field(default=None, gt=0)
    forex_currency: str | None = Field(default=None, max_length=3)
    rate_per_person_forex_minor: int | None = Field(default=None, gt=0)

    @field_validator("forex_currency")
    @classmethod
    def normalize_forex(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        code = value.strip().upper()
        if code not in SUPPORTED_GROUP_FOREX:
            raise ValueError("forex_currency must be USD, EUR, or GBP")
        return code

    @property
    def total_forex_minor(self) -> int | None:
        if (
            self.pax is None
            or self.rate_per_person_forex_minor is None
            or self.forex_currency is None
        ):
            return None
        return self.pax * self.rate_per_person_forex_minor


class CustomerPaymentCreate(BaseModel):
    payment_date: date
    amount_kurus: int | None = Field(default=None, gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    payment_account_id: uuid.UUID
    payment_native_quantity: int | None = Field(default=None, gt=0)
    group_sale_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def require_amount_or_native(self) -> CustomerPaymentCreate:
        if self.amount_kurus is None and self.payment_native_quantity is None:
            raise ValueError("amount_kurus or payment_native_quantity is required")
        return self


class CreditSaleResponse(BaseModel):
    journal_entry_id: uuid.UUID
    customer_ledger_entry: CustomerLedgerEntryRead
    balance_kurus: int


class CustomerPaymentResponse(BaseModel):
    journal_entry_id: uuid.UUID
    customer_ledger_entry: CustomerLedgerEntryRead
    balance_kurus: int


class CustomerPaymentCorrect(CustomerPaymentCreate):
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class CustomerPaymentCorrectOut(BaseModel):
    original_journal_entry_id: uuid.UUID
    reversal_journal_entry_id: uuid.UUID
    corrected_journal_entry_id: uuid.UUID
    customer_ledger_entry: CustomerLedgerEntryRead
    balance_kurus: int


class CreditSaleCorrect(CreditSaleCreate):
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class CreditSaleCorrectOut(BaseModel):
    original_journal_entry_id: uuid.UUID
    reversal_journal_entry_id: uuid.UUID
    corrected_journal_entry_id: uuid.UUID
    customer_ledger_entry: CustomerLedgerEntryRead
    balance_kurus: int
