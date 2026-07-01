"""Money account and bank statement API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.features.banking.models import MoneyAccountKind
from app.features.banking.statement_models import (
    StatementLineClassification,
    StatementLineStatus,
)


class MoneyAccountCreate(BaseModel):
    account_kind: MoneyAccountKind
    currency: str | None = Field(
        default=None,
        min_length=3,
        max_length=3,
        description="ISO currency code — required for foreign_currency accounts (USD, EUR, GBP)",
    )
    name: str = Field(min_length=1, max_length=255)
    bank_name: str | None = Field(
        default=None,
        max_length=255,
        description="Bank name for bank accounts; card issuer label for credit cards",
    )
    iban: str | None = Field(default=None, max_length=34)
    last_four: str | None = Field(default=None, min_length=4, max_length=4)


class MoneyAccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    bank_name: str | None = Field(default=None, max_length=255)
    iban: str | None = Field(default=None, max_length=34)
    last_four: str | None = Field(default=None, min_length=4, max_length=4)
    is_active: bool | None = None


class MoneyAccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    account_kind: MoneyAccountKind
    currency: str | None = None
    name: str
    gl_account_id: uuid.UUID
    gl_account_code: str
    bank_name: str | None
    iban: str | None
    last_four: str | None
    is_active: bool
    balance_kurus: int
    native_quantity: int | None = None
    created_at: datetime
    updated_at: datetime


class MoneyAccountTreeLeaf(BaseModel):
    id: uuid.UUID
    name: str
    account_kind: MoneyAccountKind
    currency: str | None = None
    gl_account_id: uuid.UUID
    gl_account_code: str
    bank_name: str | None
    iban: str | None
    last_four: str | None
    is_active: bool
    balance_kurus: int
    native_quantity: int | None = None


class MoneyAccountTreeBranch(BaseModel):
    bucket_code: str
    bucket_name_en: str
    bucket_name_tr: str
    bucket_gl_account_id: uuid.UUID
    balance_kurus: int
    accounts: list[MoneyAccountTreeLeaf]


class ForeignCurrencyTree(BaseModel):
    usd: MoneyAccountTreeBranch
    eur: MoneyAccountTreeBranch
    gbp: MoneyAccountTreeBranch


class MoneyAccountTree(BaseModel):
    banks: MoneyAccountTreeBranch
    cash: MoneyAccountTreeBranch
    credit_cards: MoneyAccountTreeBranch
    foreign_currency: ForeignCurrencyTree


class ClassificationSuggestion(BaseModel):
    classification: StatementLineClassification
    supplier_id: uuid.UUID | None = None
    reason: str
    confidence: str


class BankStatementLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    statement_id: uuid.UUID
    transaction_date: date
    amount_kurus: int
    description: str
    reference: str | None
    classification: StatementLineClassification
    status: StatementLineStatus
    supplier_id: uuid.UUID | None
    journal_entry_id: uuid.UUID | None
    supplier_ledger_entry_id: uuid.UUID | None
    account_transfer_id: uuid.UUID | None
    pos_settlement_id: uuid.UUID | None = None
    delivery_settlement_id: uuid.UUID | None = None
    credit_card_payment_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    customer_ledger_entry_id: uuid.UUID | None = None
    review_reason: str | None = None
    candidate_supplier_ledger_entry_id: uuid.UUID | None = None
    candidate_account_transfer_id: uuid.UUID | None = None
    expense_entry_id: uuid.UUID | None = None
    classification_source: str | None = None
    suggestion: ClassificationSuggestion | None = None


class NeedsReviewStatementLineRead(BankStatementLineRead):
    money_account_id: uuid.UUID
    original_filename: str


class CreateSupplierFromLineRequest(BaseModel):
    name: str | None = Field(
        default=None,
        max_length=512,
        description="Supplier name — defaults to line description",
    )
    vkn: str | None = Field(
        default=None,
        min_length=10,
        max_length=11,
        description="Tax id — placeholder generated when omitted",
    )
    match_token: str | None = Field(
        default=None,
        max_length=512,
        description="Learned rule token — defaults to normalized description",
    )


class CreateSupplierFromLineResult(BaseModel):
    supplier_id: uuid.UUID
    supplier_name: str
    line: BankStatementLineRead


class BankStatementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    money_account_id: uuid.UUID
    file_fingerprint: str
    period_start: date
    period_end: date
    original_filename: str
    line_count: int
    imported_at: datetime
    lines: list[BankStatementLineRead]


class BankImportProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    money_account_id: uuid.UUID
    header_row: int = Field(ge=1)
    data_start_row: int = Field(ge=1)
    date_col: int = Field(ge=0)
    description_col: int = Field(ge=0)
    reference_col: int | None = Field(default=None, ge=0)
    amount_col: int | None = Field(default=None, ge=0)
    debit_col: int | None = Field(default=None, ge=0)
    credit_col: int | None = Field(default=None, ge=0)
    date_format: str
    decimal_format: str
    debit_is_outflow: bool
    csv_encoding: str = "auto"
    csv_delimiter: str = "auto"
    updated_at: datetime


class BankImportProfileUpsert(BaseModel):
    header_row: int = Field(ge=1)
    data_start_row: int = Field(ge=1)
    date_col: int = Field(ge=0)
    description_col: int = Field(ge=0)
    reference_col: int | None = Field(default=None, ge=0)
    amount_col: int | None = Field(default=None, ge=0)
    debit_col: int | None = Field(default=None, ge=0)
    credit_col: int | None = Field(default=None, ge=0)
    date_format: str
    decimal_format: str = "tr"
    debit_is_outflow: bool = True
    csv_encoding: str = "auto"
    csv_delimiter: str = "auto"


class BankStatementPreview(BaseModel):
    rows: list[list[str]]
    total_rows: int
    csv_encoding: str | None = None
    csv_delimiter: str | None = None
    suggested_profile: BankImportProfileUpsert | None = None


class ClassifyStatementLineRequest(BaseModel):
    classification: StatementLineClassification
    supplier_id: uuid.UUID | None = None
    counterpart_money_account_id: uuid.UUID | None = None
    credit_card_money_account_id: uuid.UUID | None = None
    actor_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    delivery_platform_id: uuid.UUID | None = Field(
        default=None,
        description="Required for delivery_settlement — entity delivery platform id",
    )
    confirm_supplier_ledger_entry_id: uuid.UUID | None = None
    confirm_account_transfer_id: uuid.UUID | None = None
    expense_account_id: uuid.UUID | None = Field(
        default=None,
        description="Required for rent_utility — owner picks expense GL account (e.g. 5000 rent)",
    )
    match_token: str | None = Field(
        default=None,
        max_length=512,
        description="Optional learned rule token — defaults to normalized line description when omitted",
    )


class CorrectStatementLineRequest(BaseModel):
    classification: StatementLineClassification
    supplier_id: uuid.UUID | None = None
    counterpart_money_account_id: uuid.UUID | None = None
    credit_card_money_account_id: uuid.UUID | None = None
    actor_id: uuid.UUID
    customer_id: uuid.UUID | None = None
    delivery_platform_id: uuid.UUID | None = None
    expense_account_id: uuid.UUID | None = None
    reason: str | None = Field(default=None, max_length=512)
    match_token: str | None = Field(
        default=None,
        max_length=512,
        description="Optional learned rule token for correction relearn — defaults to line description",
    )


class ClassifyStatementLineResult(BaseModel):
    line: BankStatementLineRead
    linked_existing_payment: bool
    linked_existing_transfer: bool = False
    linked_existing_settlement: bool = False
    routed_to_needs_review: bool = False
    journal_entry_id: uuid.UUID | None


class AccountTransferCreate(BaseModel):
    from_money_account_id: uuid.UUID
    to_money_account_id: uuid.UUID
    transfer_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: uuid.UUID


class AccountTransferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    from_money_account_id: uuid.UUID
    to_money_account_id: uuid.UUID
    amount_kurus: int
    transfer_date: date
    description: str
    actor_id: uuid.UUID
    journal_entry_id: uuid.UUID
    from_statement_line_id: uuid.UUID | None
    to_statement_line_id: uuid.UUID | None
    created_at: datetime
