"""Split hub schemas — bank expense + supplier payment personal peel."""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, Field

from app.core.schema_types import OptionalActorId
from app.features.partners.schema import PartnerLedgerEntryRead


class BankExpenseSplitCandidate(BaseModel):
    expense_id: uuid.UUID
    expense_date: date
    description: str
    amount_kurus: int
    expense_account_id: uuid.UUID
    already_split_kurus: int
    remaining_splittable_kurus: int
    bank_statement_line_id: uuid.UUID


class BankExpenseSplitListOut(BaseModel):
    items: list[BankExpenseSplitCandidate]
    total: int
    limit: int
    offset: int


class BankExpenseSplitCreate(BaseModel):
    expense_id: uuid.UUID
    partner_id: uuid.UUID
    personal_amount_kurus: int = Field(gt=0)
    note: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None


class BankExpenseSplitResponse(BaseModel):
    journal_entry_id: uuid.UUID
    partner_ledger_entry: PartnerLedgerEntryRead
    personal_amount_kurus: int
    restaurant_amount_kurus: int
    remaining_splittable_kurus: int
    description: str


class SupplierPaymentSplitCandidate(BaseModel):
    supplier_ledger_entry_id: uuid.UUID
    supplier_id: uuid.UUID
    supplier_name: str
    payment_date: date
    description: str
    amount_kurus: int
    already_split_kurus: int
    remaining_splittable_kurus: int
    journal_entry_id: uuid.UUID


class SupplierPaymentSplitListOut(BaseModel):
    items: list[SupplierPaymentSplitCandidate]
    total: int
    limit: int
    offset: int


class SupplierPaymentSplitCreate(BaseModel):
    supplier_ledger_entry_id: uuid.UUID
    partner_id: uuid.UUID
    personal_amount_kurus: int = Field(gt=0)
    expense_account_id: uuid.UUID
    note: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None


class SupplierPaymentSplitResponse(BaseModel):
    journal_entry_id: uuid.UUID
    partner_ledger_entry: PartnerLedgerEntryRead
    personal_amount_kurus: int
    restaurant_amount_kurus: int
    remaining_splittable_kurus: int
    description: str
