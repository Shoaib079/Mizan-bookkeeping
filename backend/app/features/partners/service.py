"""Partner feature service — master data + posting wrappers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.core.partners import posting as partner_posting
from app.core.partners.ledger import current_balance_kurus, list_ledger_entries
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.core.ledger.correction import CorrectionNotFoundError, correct_partner_journal_entry
from app.core.ledger.posting import PostingLine
from app.core.chart_of_accounts.default_chart import PARTNER_REIMBURSEMENT_PAYABLE_CODE
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
)

HUNDRED = Decimal("100")


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
    balance = current_balance_kurus(session, entity_id, partner_id)
    entries = list_ledger_entries(session, entity_id, partner_id)
    return PartnerLedgerRead(
        partner_id=partner_id,
        balance_kurus=balance,
        entries=[PartnerLedgerEntryRead.model_validate(e) for e in entries],
    )


def record_expense_fronted(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: ExpenseFrontedCreate,
) -> ExpenseFrontedResponse:
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
        partner_ledger_entry=PartnerLedgerEntryRead.model_validate(
            result.partner_ledger_entry
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
        partner_ledger_entry=PartnerLedgerEntryRead.model_validate(
            result.partner_ledger_entry
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
        partner_ledger_entry=PartnerLedgerEntryRead.model_validate(
            result.partner_ledger_entry
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
        partner_ledger_entry=PartnerLedgerEntryRead.model_validate(
            result.partner_ledger_entry
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
        payable = partner_posting._chart_account(session, PARTNER_REIMBURSEMENT_PAYABLE_CODE)
        lines = partner_posting.build_reimbursement_paid_lines(
            partner_payable_id=payable.id,
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
        payable = partner_posting._chart_account(session, PARTNER_REIMBURSEMENT_PAYABLE_CODE)
        lines = partner_posting.build_drawing_repayment_lines(
            partner_payable_id=payable.id,
            payment_account_id=payment.id,
            amount_kurus=gl_amount,
        )
        return lines, gl_amount

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
        partner_ledger_entry=PartnerLedgerEntryRead.model_validate(new_row),
        balance_kurus=balance,
    )
