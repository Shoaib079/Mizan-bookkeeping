"""Partner feature service — master data + posting wrappers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.core.partners import posting as partner_posting
from app.core.partners.ledger import (
    capital_balance_kurus,
    current_balance_kurus,
    list_ledger_entries,
    reimbursement_balance_kurus,
)
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.core.ledger.correction import (
    CorrectionNotFoundError,
    correct_partner_journal_entry,
    void_partner_journal_entry,
)
from app.core.ledger.posting import PostingLine
from app.core.ledger.subledger_display import enrich_entry_models
from app.core.chart_of_accounts.default_chart import (
    OWNER_DRAWINGS_CODE,
    PARTNER_REIMBURSEMENT_PAYABLE_CODE,
)
from app.core.duplicate_guard import (
    ensure_not_duplicate,
    find_duplicate_partner_expense_fronted,
)
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.partners.models import Partner
from app.features.partners.schema import (
    ExpenseFrontedCreate,
    ExpenseFrontedResponse,
    OwnershipShareSummary,
    PartnerCreate,
    PartnerLedgerEntryRead,
    PartnerLedgerRead,
    PartnerUpdate,
    ReimbursementPaidCreate,
    ReimbursementPaidResponse,
    DrawingCreate,
    DrawingRepaymentCreate,
    DrawingResponse,
    DrawingRepaymentResponse,
    PartnerJournalEntryCorrect,
    PartnerJournalEntryCorrectOut,
    ProfitAllocationPost,
    ProfitAllocationPostOut,
    ProfitAllocationPreviewLine,
    ProfitAllocationPreviewRead,
    ProfitAllocationPreviewRequest,
    ProfitAllocationVoid,
    ProfitAllocationVoidOut,
)
from app.core.partners import profit_allocation as partner_profit_allocation
from app.core.partners.profit_allocation import OwnershipShareError
from app.features.reports.financial_statements import get_profit_and_loss

HUNDRED = Decimal("100")


def _partner_entry_reads(
    session: Session, entries: list[PartnerLedgerEntry]
) -> list[PartnerLedgerEntryRead]:
    if not entries:
        return []
    return enrich_entry_models(
        session,
        PartnerLedgerEntryRead,
        entries,
        journal_entry_id=lambda entry: entry.journal_entry_id,
        description=lambda entry: entry.description,
    )


def _partner_entry_read(
    session: Session, entry: PartnerLedgerEntry, *, entity_id: uuid.UUID
) -> PartnerLedgerEntryRead:
    with entity_context(session, entity_id):
        require_entity_context()
        return _partner_entry_reads(session, [entry])[0]


def ownership_share_summary(
    session: Session, entity_id: uuid.UUID
) -> OwnershipShareSummary:
    """Sum active partners' share % — warn only when set shares ≠ 100%."""
    with entity_context(session, entity_id):
        require_entity_context()
        partners = session.scalars(
            select(Partner).where(Partner.is_active.is_(True))
        ).all()
        shares = [
            p.ownership_share_pct
            for p in partners
            if p.ownership_share_pct is not None
        ]
        if not shares:
            return OwnershipShareSummary()
        total = sum(shares, start=Decimal("0"))
        warning = None
        if total != HUNDRED:
            warning = (
                f"Ownership shares total {total}% across active partners — "
                "expected 100% (informational only)."
            )
        return OwnershipShareSummary(
            total_pct=total,
            partners_with_share=len(shares),
            warning=warning,
        )


def create_partner(
    session: Session, entity_id: uuid.UUID, payload: PartnerCreate
) -> Partner:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        partner = Partner(
            name=payload.name,
            notes=payload.notes,
            ownership_share_pct=payload.ownership_share_pct,
        )
        session.add(partner)
        session.commit()
        session.refresh(partner)
        return partner


def list_partners(
    session: Session,
    entity_id: uuid.UUID,
    *,
    include_inactive: bool = False,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[Partner], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if not include_inactive:
            filters.append(Partner.is_active.is_(True))
        search = text_search_filter(q, Partner.name)
        if search is not None:
            filters.append(search)
        stmt = select(Partner).where(*filters).order_by(Partner.name)
        return fetch_paginated(session, stmt, params)


def get_partner(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> Partner:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        partner = session.get(Partner, partner_id)
        if partner is None:
            raise LookupError("Partner not found")
        return partner


def update_partner(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: PartnerUpdate,
) -> Partner:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        partner = session.get(Partner, partner_id)
        if partner is None:
            raise LookupError("Partner not found")

        if payload.name is not None:
            partner.name = payload.name
        if payload.notes is not None:
            partner.notes = payload.notes
        if payload.is_active is not None:
            partner.is_active = payload.is_active
        if "ownership_share_pct" in payload.model_fields_set:
            partner.ownership_share_pct = payload.ownership_share_pct

        session.commit()
        session.refresh(partner)
        return partner


def get_partner_ledger(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> PartnerLedgerRead:
    with entity_context(session, entity_id):
        require_entity_context()
        reimbursement = reimbursement_balance_kurus(session, entity_id, partner_id)
        capital = capital_balance_kurus(session, entity_id, partner_id)
        entries = list_ledger_entries(session, entity_id, partner_id)
        reads = _partner_entry_reads(session, entries)
    return PartnerLedgerRead(
        partner_id=partner_id,
        balance_kurus=reimbursement,
        capital_balance_kurus=capital,
        entries=reads,
    )


def record_expense_fronted(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: ExpenseFrontedCreate,
) -> ExpenseFrontedResponse:
    with entity_context(session, entity_id):
        require_entity_context()
        ensure_not_duplicate(
            find_duplicate_partner_expense_fronted(
                session,
                partner_id=partner_id,
                expense_date=payload.expense_date,
                amount_kurus=payload.amount_kurus,
                expense_account_id=payload.expense_account_id,
            ),
            acknowledged=payload.acknowledge_duplicate,
        )
    result = partner_posting.post_expense_fronted(
        session,
        entity_id,
        partner_id,
        expense_date=payload.expense_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        expense_account_id=payload.expense_account_id,
    )
    return ExpenseFrontedResponse(
        journal_entry_id=result.journal_entry.id,
        partner_ledger_entry=_partner_entry_read(
            session, result.partner_ledger_entry, entity_id=entity_id
        ),
        balance_kurus=result.balance_kurus,
    )


def record_reimbursement_paid(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: ReimbursementPaidCreate,
) -> ReimbursementPaidResponse:
    result = partner_posting.post_reimbursement_paid(
        session,
        entity_id,
        partner_id,
        payment_date=payload.payment_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
    )
    return ReimbursementPaidResponse(
        journal_entry_id=result.journal_entry.id,
        partner_ledger_entry=_partner_entry_read(
            session, result.partner_ledger_entry, entity_id=entity_id
        ),
        balance_kurus=result.balance_kurus,
    )


def record_drawing(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: DrawingCreate,
) -> DrawingResponse:
    result = partner_posting.post_drawing(
        session,
        entity_id,
        partner_id,
        drawing_date=payload.drawing_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
    )
    return DrawingResponse(
        journal_entry_id=result.journal_entry.id,
        partner_ledger_entry=_partner_entry_read(
            session, result.partner_ledger_entry, entity_id=entity_id
        ),
        balance_kurus=result.balance_kurus,
    )


def record_drawing_repayment(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: DrawingRepaymentCreate,
) -> DrawingRepaymentResponse:
    result = partner_posting.post_drawing_repayment(
        session,
        entity_id,
        partner_id,
        payment_date=payload.payment_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
    )
    return DrawingRepaymentResponse(
        journal_entry_id=result.journal_entry.id,
        partner_ledger_entry=_partner_entry_read(
            session, result.partner_ledger_entry, entity_id=entity_id
        ),
        balance_kurus=result.balance_kurus,
    )


def _build_partner_correction_lines(
    session: Session,
    entity_id: uuid.UUID,
    partner_row: PartnerLedgerEntry,
    payload: PartnerJournalEntryCorrect,
) -> tuple[list[PostingLine], int]:
    amount_kurus = (
        payload.amount_kurus if payload.amount_kurus is not None else partner_row.amount_kurus
    )
    movement_type = partner_row.movement_type

    if movement_type == PartnerMovementType.EXPENSE_FRONTED:
        if payload.expense_account_id is None:
            raise ValueError("expense_account_id required for expense fronted correction")
        expense = partner_posting._validate_expense_account(
            session, entity_id, payload.expense_account_id
        )
        payable = partner_posting._chart_account(session, PARTNER_REIMBURSEMENT_PAYABLE_CODE)
        lines = partner_posting.build_expense_fronted_lines(
            expense_account_id=expense.id,
            partner_payable_id=payable.id,
            amount_kurus=amount_kurus,
        )
        return lines, amount_kurus

    if movement_type == PartnerMovementType.REIMBURSEMENT_PAID:
        if payload.payment_account_id is None:
            raise ValueError("payment_account_id required for reimbursement correction")
        payment = partner_posting._validate_payment_account(
            session, entity_id, payload.payment_account_id
        )
        payable = partner_posting._chart_account(session, PARTNER_REIMBURSEMENT_PAYABLE_CODE)
        lines = partner_posting.build_reimbursement_paid_lines(
            partner_payable_id=payable.id,
            payment_account_id=payment.id,
            amount_kurus=amount_kurus,
        )
        return lines, amount_kurus

    if movement_type == PartnerMovementType.DRAWING:
        if payload.payment_account_id is None:
            raise ValueError("payment_account_id required for drawing correction")
        gl_amount = (
            payload.amount_kurus
            if payload.amount_kurus is not None
            else abs(partner_row.amount_kurus)
        )
        payment = partner_posting._validate_payment_account(
            session, entity_id, payload.payment_account_id
        )
        drawings = partner_posting._chart_account(session, OWNER_DRAWINGS_CODE)
        lines = partner_posting.build_drawing_lines(
            drawings_account_id=drawings.id,
            payment_account_id=payment.id,
            amount_kurus=gl_amount,
        )
        return lines, -gl_amount

    if movement_type == PartnerMovementType.DRAWING_REPAYMENT:
        if payload.payment_account_id is None:
            raise ValueError("payment_account_id required for drawing repayment correction")
        gl_amount = (
            payload.amount_kurus
            if payload.amount_kurus is not None
            else abs(partner_row.amount_kurus)
        )
        payment = partner_posting._validate_payment_account(
            session, entity_id, payload.payment_account_id
        )
        drawings = partner_posting._chart_account(session, OWNER_DRAWINGS_CODE)
        lines = partner_posting.build_drawing_repayment_lines(
            drawings_account_id=drawings.id,
            payment_account_id=payment.id,
            amount_kurus=gl_amount,
        )
        return lines, gl_amount

    if movement_type == PartnerMovementType.PROFIT_ALLOCATION:
        raise CorrectionNotFoundError(
            "profit allocation must be voided at entity level, not per-partner correct"
        )

    raise CorrectionNotFoundError("partner movement type is not correctable")


def correct_partner_journal_entry_http(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: PartnerJournalEntryCorrect,
) -> PartnerJournalEntryCorrectOut:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        partner_row = session.scalar(
            select(PartnerLedgerEntry).where(
                PartnerLedgerEntry.journal_entry_id == journal_entry_id,
                PartnerLedgerEntry.partner_id == partner_id,
            )
        )
        if partner_row is None:
            raise CorrectionNotFoundError("partner ledger entry not found for journal entry")
        lines, amount_kurus = _build_partner_correction_lines(
            session, entity_id, partner_row, payload
        )

    result = correct_partner_journal_entry(
        session,
        entity_id,
        journal_entry_id,
        payload.entry_date,
        payload.description,
        lines,
        actor_id=payload.actor_id,
        amount_kurus=amount_kurus,
        reason=payload.reason,
        void_date=payload.void_date,
        period_unlock_reason=payload.period_unlock_reason,
    )
    balance = current_balance_kurus(session, entity_id, partner_id)
    with entity_context(session, entity_id):
        new_row = session.scalar(
            select(PartnerLedgerEntry).where(
                PartnerLedgerEntry.journal_entry_id == result.corrected.id
            )
        )
    if new_row is None:
        raise CorrectionNotFoundError("corrected partner ledger entry not found")

    return PartnerJournalEntryCorrectOut(
        original_journal_entry_id=result.original.id,
        reversal_journal_entry_id=result.reversal.id,
        corrected_journal_entry_id=result.corrected.id,
        partner_ledger_entry=_partner_entry_read(session, new_row, entity_id=entity_id),
        balance_kurus=balance,
    )


def void_partner_journal_entry_http(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
):
    from app.features.ledger.schema import SubledgerVoidOut

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        partner_row = session.scalar(
            select(PartnerLedgerEntry).where(
                PartnerLedgerEntry.journal_entry_id == journal_entry_id,
                PartnerLedgerEntry.partner_id == partner_id,
            )
        )
        if partner_row is None:
            raise CorrectionNotFoundError("partner ledger entry not found for journal entry")
        if partner_row.movement_type.value == "profit_allocation":
            raise CorrectionNotFoundError(
                "profit allocation must be voided at entity level, not per-partner void"
            )

    result = void_partner_journal_entry(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
    )
    return SubledgerVoidOut(
        original_journal_entry_id=result.original.id,
        reversal_journal_entry_id=result.reversal.id,
    )


def _resolve_profit_kurus(
    session: Session,
    entity_id: uuid.UUID,
    *,
    profit_kurus: int | None,
    period_from: date | None,
    period_to: date | None,
) -> int:
    if profit_kurus is not None:
        return profit_kurus
    if period_from is None or period_to is None:
        raise ValueError("Provide profit_kurus or both period_from and period_to")
    pl = get_profit_and_loss(session, entity_id, period_from, period_to)
    if pl.net_income_kurus <= 0:
        raise ValueError("Period net profit must be positive to allocate")
    return pl.net_income_kurus


def preview_profit_allocation(
    session: Session,
    entity_id: uuid.UUID,
    payload: ProfitAllocationPreviewRequest,
) -> ProfitAllocationPreviewRead:
    profit_kurus = _resolve_profit_kurus(
        session,
        entity_id,
        profit_kurus=payload.profit_kurus,
        period_from=payload.period_from,
        period_to=payload.period_to,
    )
    preview = partner_profit_allocation.preview_profit_allocation(
        session, entity_id, profit_kurus=profit_kurus
    )
    return ProfitAllocationPreviewRead(
        total_profit_kurus=preview.total_profit_kurus,
        lines=[
            ProfitAllocationPreviewLine(
                partner_id=line.partner_id,
                partner_name=line.partner_name,
                ownership_share_pct=line.ownership_share_pct,
                amount_kurus=line.amount_kurus,
            )
            for line in preview.splits
        ],
    )


def post_profit_allocation(
    session: Session,
    entity_id: uuid.UUID,
    payload: ProfitAllocationPost,
) -> ProfitAllocationPostOut:
    profit_kurus = _resolve_profit_kurus(
        session,
        entity_id,
        profit_kurus=payload.profit_kurus,
        period_from=payload.period_from,
        period_to=payload.period_to,
    )
    result = partner_profit_allocation.post_profit_allocation(
        session,
        entity_id,
        allocation_date=payload.allocation_date,
        profit_kurus=profit_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
    )
    with entity_context(session, entity_id):
        require_entity_context()
        partner_reads = _partner_entry_reads(
            session, list(result.partner_ledger_entries)
        )
    return ProfitAllocationPostOut(
        journal_entry_id=result.journal_entry.id,
        total_profit_kurus=profit_kurus,
        partner_ledger_entries=partner_reads,
    )


def void_profit_allocation(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: ProfitAllocationVoid,
) -> ProfitAllocationVoidOut:
    original, reversal = partner_profit_allocation.void_profit_allocation(
        session,
        entity_id,
        journal_entry_id,
        actor_id=payload.actor_id,
        reason=payload.reason,
        void_date=payload.void_date,
        period_unlock_reason=payload.period_unlock_reason,
    )
    return ProfitAllocationVoidOut(
        original_journal_entry_id=original.id,
        reversal_journal_entry_id=reversal.id,
    )
