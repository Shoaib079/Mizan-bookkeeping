"""Partner API schemas (Decisions §17)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.core.schema_types import OptionalActorId, AcknowledgeDuplicateMixin

from app.core.ledger.subledger_display import SubledgerDisplayKind
from app.core.partners.types import PartnerMovementType


class PartnerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=512)
    notes: str | None = Field(default=None, max_length=2048)
    ownership_share_pct: Decimal | None = Field(default=None, ge=0, le=100)


class PartnerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=512)
    notes: str | None = Field(default=None, max_length=2048)
    is_active: bool | None = None
    ownership_share_pct: Decimal | None = Field(default=None, ge=0, le=100)


class PartnerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    is_active: bool
    ownership_share_pct: Decimal | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class OwnershipShareSummary(BaseModel):
    """Informational totals for active partners — warn only, not GL."""

    total_pct: Decimal | None = None
    partners_with_share: int = 0
    warning: str | None = None


class PartnerListOut(BaseModel):
    items: list[PartnerRead]
    total: int
    limit: int
    offset: int
    ownership_share: OwnershipShareSummary


class PartnerLedgerEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    partner_id: uuid.UUID
    movement_date: date
    movement_type: PartnerMovementType
    amount_kurus: int
    description: str
    actor_id: OptionalActorId = None
    journal_entry_id: uuid.UUID | None
    # GL account a reimbursement was paid from — restores the picker.
    payment_account_id: uuid.UUID | None = None
    # What produced the row. A DRAWING written by a personal expense split
    # carries "expense_entry"/"supplier_ledger_entry"; a partner who actually
    # withdrew cash carries none. Without this the UI cannot tell them apart
    # and reports both as money taken out.
    reference_type: str | None = None
    running_balance_kurus: int | None = None
    created_at: datetime
    display_kind: SubledgerDisplayKind = SubledgerDisplayKind.EFFECTIVE
    was_corrected: bool = False


class PartnerLedgerRead(BaseModel):
    partner_id: uuid.UUID
    balance_kurus: int
    capital_balance_kurus: int = 0
    capital_contribution_kurus: int = 0
    profit_allocated_kurus: int = 0
    #: Of the allocated profit, how much cleared drawings rather than being
    #: paid. allocated = settled + paid + unpaid.
    profit_settled_kurus: int = 0
    unpaid_profit_kurus: int = 0
    drawings_net_kurus: int = 0
    net_balance_kurus: int = 0
    #: What the partner is owed or owes today, profit included — the figure the
    #: ledger's running column ends on. `net_balance_kurus` above is the
    #: narrower one that decides how much of a new allocation clears drawings;
    #: they answer different questions and are not interchangeable.
    current_account_kurus: int = 0
    loan_balance_kurus: int = 0
    entries: list[PartnerLedgerEntryRead]


class ExpenseFrontedCreate(AcknowledgeDuplicateMixin):
    expense_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    expense_account_id: uuid.UUID


class PartnerSplitBuyCreate(BaseModel):
    expense_date: date
    restaurant_amount_kurus: int = Field(ge=0)
    personal_amount_kurus: int = Field(ge=0)
    note: str = Field(min_length=1, max_length=512)
    invoice_number: str | None = Field(default=None, max_length=128)
    expense_account_id: uuid.UUID | None = None
    supplier_id: uuid.UUID | None = None
    actor_id: OptionalActorId = None

    @model_validator(mode="after")
    def _at_least_one_amount(self) -> PartnerSplitBuyCreate:
        if self.restaurant_amount_kurus == 0 and self.personal_amount_kurus == 0:
            raise ValueError("restaurant or personal amount must be positive")
        return self


class PartnerSplitBuyResponse(BaseModel):
    journal_entry_ids: list[uuid.UUID]
    partner_ledger_entry: PartnerLedgerEntryRead | None
    balance_kurus: int
    description: str


class ReimbursementPaidCreate(BaseModel):
    payment_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    payment_account_id: uuid.UUID


class ExpenseFrontedResponse(BaseModel):
    journal_entry_id: uuid.UUID
    partner_ledger_entry: PartnerLedgerEntryRead
    balance_kurus: int


class ReimbursementPaidResponse(BaseModel):
    journal_entry_id: uuid.UUID
    partner_ledger_entry: PartnerLedgerEntryRead
    balance_kurus: int


class PayPartnerCreate(BaseModel):
    """Cash payout to partner — settle fronted owe first, remainder as drawing."""

    payment_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    payment_account_id: uuid.UUID


class PayPartnerResponse(BaseModel):
    journal_entry_ids: list[uuid.UUID]
    reimbursement_kurus: int
    drawing_kurus: int
    balance_kurus: int
    net_balance_kurus: int
    partner_ledger_entries: list[PartnerLedgerEntryRead]


class DrawingCreate(BaseModel):
    drawing_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    payment_account_id: uuid.UUID


class DrawingRepaymentCreate(BaseModel):
    payment_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    payment_account_id: uuid.UUID


class DrawingResponse(BaseModel):
    journal_entry_id: uuid.UUID
    partner_ledger_entry: PartnerLedgerEntryRead
    balance_kurus: int


class DrawingRepaymentResponse(BaseModel):
    journal_entry_id: uuid.UUID
    partner_ledger_entry: PartnerLedgerEntryRead
    balance_kurus: int


class CapitalContributionCreate(BaseModel):
    contribution_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    payment_account_id: uuid.UUID


class CapitalContributionResponse(BaseModel):
    journal_entry_id: uuid.UUID
    partner_ledger_entry: PartnerLedgerEntryRead
    balance_kurus: int


class ProfitPaidCreate(BaseModel):
    payment_date: date
    amount_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    payment_account_id: uuid.UUID


class ProfitPaidResponse(BaseModel):
    journal_entry_id: uuid.UUID
    partner_ledger_entry: PartnerLedgerEntryRead
    unpaid_profit_kurus: int
    balance_kurus: int


class PartnerJournalEntryCorrect(BaseModel):
    entry_date: date
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    amount_kurus: int | None = Field(default=None, gt=0)
    expense_account_id: uuid.UUID | None = None
    payment_account_id: uuid.UUID | None = None
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class PartnerJournalEntryCorrectOut(BaseModel):
    original_journal_entry_id: uuid.UUID
    reversal_journal_entry_id: uuid.UUID
    corrected_journal_entry_id: uuid.UUID
    partner_ledger_entry: PartnerLedgerEntryRead
    balance_kurus: int


class ProfitAllocationPreviewLine(BaseModel):
    partner_id: uuid.UUID
    partner_name: str
    ownership_share_pct: Decimal
    amount_kurus: int
    gross_amount_kurus: int = 0
    net_balance_before_kurus: int = 0
    offset_kurus: int = 0


class ProfitAllocationPreviewRead(BaseModel):
    total_profit_kurus: int
    total_allocated_kurus: int = 0
    net_against_drawings: bool = True
    netting_as_of: date | None = None
    lines: list[ProfitAllocationPreviewLine]


class ProfitAllocationPreviewRequest(BaseModel):
    profit_kurus: int | None = Field(default=None, gt=0)
    period_from: date | None = None
    period_to: date | None = None
    allocation_date: date | None = None
    net_against_drawings: bool = True


class ProfitAllocationPost(BaseModel):
    allocation_date: date
    profit_kurus: int | None = Field(default=None, gt=0)
    period_from: date | None = None
    period_to: date | None = None
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    net_against_drawings: bool = True


class ProfitAllocationPostOut(BaseModel):
    journal_entry_id: uuid.UUID
    total_profit_kurus: int
    total_allocated_kurus: int = 0
    net_against_drawings: bool = True
    partner_ledger_entries: list[PartnerLedgerEntryRead]


class ProfitAllocationVoid(BaseModel):
    actor_id: OptionalActorId = None
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class ProfitAllocationCorrect(BaseModel):
    """Edit allocation total/date — voids the original JE and reposts."""

    allocation_date: date
    profit_kurus: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=512)
    actor_id: OptionalActorId = None
    net_against_drawings: bool = True
    period_from: date | None = None
    period_to: date | None = None
    reason: str | None = Field(default=None, max_length=512)
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class ProfitAllocationVoidOut(BaseModel):
    original_journal_entry_id: uuid.UUID
    reversal_journal_entry_id: uuid.UUID
