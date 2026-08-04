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
    capital_contribution_kurus,
    current_balance_kurus,
    drawings_net_kurus,
    list_ledger_entries,
    loan_balance_kurus,
    net_balance_kurus,
    profit_allocated_kurus,
    reimbursement_balance_kurus,
    unpaid_profit_kurus,
)
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import NET_BALANCE_MOVEMENT_TYPES, PartnerMovementType
from app.core.ledger.correction import (
    CorrectionNotFoundError,
    correct_partner_journal_entry,
    void_partner_journal_entry,
)
from app.core.ledger.posting import PostingLine
from app.core.ledger.subledger_display import enrich_entry_models, SubledgerDisplayKind
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
    PartnerSplitBuyCreate,
    PartnerSplitBuyResponse,
    ReimbursementPaidCreate,
    ReimbursementPaidResponse,
    PayPartnerCreate,
    PayPartnerResponse,
    DrawingCreate,
    DrawingRepaymentCreate,
    DrawingResponse,
    DrawingRepaymentResponse,
    CapitalContributionCreate,
    CapitalContributionResponse,
    ProfitPaidCreate,
    ProfitPaidResponse,
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
    reads = enrich_entry_models(
        session,
        PartnerLedgerEntryRead,
        entries,
        journal_entry_id=lambda entry: entry.journal_entry_id,
        description=lambda entry: entry.description,
    )
    # Restore the money account a reimbursement was paid from so the edit form
    # reopens with the recorded account. The helper only returns entries with a
    # single money line, so equity-only movements are naturally skipped.
    from app.features.banking.journal_money_account import (
        money_account_gl_by_journal_entry,
    )

    je_ids = [r.journal_entry_id for r in reads if r.journal_entry_id is not None]
    if je_ids:
        account_by_je = money_account_gl_by_journal_entry(session, je_ids)
        for r in reads:
            if r.journal_entry_id in account_by_je:
                r.payment_account_id = account_by_je[r.journal_entry_id]
    return reads


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
        stmt = (
            select(Partner)
            .where(*filters)
            .order_by(Partner.is_active.desc(), Partner.name)
        )
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
        contribution = capital_contribution_kurus(session, entity_id, partner_id)
        profit_allocated = profit_allocated_kurus(session, entity_id, partner_id)
        unpaid_profit = unpaid_profit_kurus(session, entity_id, partner_id)
        drawings = drawings_net_kurus(session, entity_id, partner_id)
        loan = loan_balance_kurus(session, entity_id, partner_id)
        net = net_balance_kurus(session, entity_id, partner_id)
        entries = list_ledger_entries(session, entity_id, partner_id)
        reads = _partner_entry_reads(session, entries)
        running = 0
        for read in reads:
            if read.display_kind == SubledgerDisplayKind.EFFECTIVE:
                try:
                    movement = PartnerMovementType(read.movement_type)
                except ValueError:
                    movement = None
                if movement in NET_BALANCE_MOVEMENT_TYPES:
                    running += read.amount_kurus
            read.running_balance_kurus = running
    return PartnerLedgerRead(
        partner_id=partner_id,
        balance_kurus=reimbursement,
        capital_balance_kurus=capital,
        capital_contribution_kurus=contribution,
        profit_allocated_kurus=profit_allocated,
        unpaid_profit_kurus=unpaid_profit,
        drawings_net_kurus=drawings,
        net_balance_kurus=net,
        loan_balance_kurus=loan,
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


def record_split_buy(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: PartnerSplitBuyCreate,
) -> PartnerSplitBuyResponse:
    result = partner_posting.post_partner_split_buy(
        session,
        entity_id,
        partner_id,
        expense_date=payload.expense_date,
        restaurant_amount_kurus=payload.restaurant_amount_kurus,
        personal_amount_kurus=payload.personal_amount_kurus,
        note=payload.note,
        actor_id=payload.actor_id,
        expense_account_id=payload.expense_account_id,
        supplier_id=payload.supplier_id,
        invoice_number=payload.invoice_number,
    )
    partner_read = None
    if result.partner_ledger_entry is not None:
        partner_read = _partner_entry_read(
            session, result.partner_ledger_entry, entity_id=entity_id
        )
    return PartnerSplitBuyResponse(
        journal_entry_ids=result.journal_entry_ids,
        partner_ledger_entry=partner_read,
        balance_kurus=result.balance_kurus,
        description=result.description,
    )


def _require_manual_cash_payment_account(
    session: Session,
    entity_id: uuid.UUID,
    payment_account_id: uuid.UUID,
) -> None:
    """Manual partner money APIs are cash-only; bank uses statement classify."""
    from app.core.ledger.posting import InvalidAccountError
    from app.features.banking.models import MoneyAccount, MoneyAccountKind

    with entity_context(session, entity_id):
        require_entity_context()
        money = session.scalar(
            select(MoneyAccount).where(
                MoneyAccount.entity_id == entity_id,
                MoneyAccount.gl_account_id == payment_account_id,
            )
        )
        if money is None:
            raise InvalidAccountError("payment account not found for this entity")
        if money.account_kind != MoneyAccountKind.CASH:
            raise InvalidAccountError(
                "Manual partner money is cash-only — classify bank lines on the "
                "bank statement"
            )


def record_reimbursement_paid(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: ReimbursementPaidCreate,
) -> ReimbursementPaidResponse:
    _require_manual_cash_payment_account(
        session, entity_id, payload.payment_account_id
    )
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


def record_pay_partner(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: PayPartnerCreate,
) -> PayPartnerResponse:
    """Cash Pay partner — settle fronted owe first, excess as drawing."""
    _require_manual_cash_payment_account(
        session, entity_id, payload.payment_account_id
    )
    result = partner_posting.post_pay_partner(
        session,
        entity_id,
        partner_id,
        payment_date=payload.payment_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description.strip(),
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
    )
    journal_ids: list[uuid.UUID] = []
    entries: list[PartnerLedgerEntry] = []
    if result.reimbursement_journal_entry is not None:
        journal_ids.append(result.reimbursement_journal_entry.id)
    if result.drawing_journal_entry is not None:
        journal_ids.append(result.drawing_journal_entry.id)
    if result.reimbursement_ledger_entry is not None:
        entries.append(result.reimbursement_ledger_entry)
    if result.drawing_ledger_entry is not None:
        entries.append(result.drawing_ledger_entry)
    return PayPartnerResponse(
        journal_entry_ids=journal_ids,
        reimbursement_kurus=result.reimbursement_kurus,
        drawing_kurus=result.drawing_kurus,
        balance_kurus=result.balance_kurus,
        net_balance_kurus=result.net_balance_kurus,
        partner_ledger_entries=[
            _partner_entry_read(session, row, entity_id=entity_id) for row in entries
        ],
    )


def record_drawing(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: DrawingCreate,
) -> DrawingResponse:
    _require_manual_cash_payment_account(
        session, entity_id, payload.payment_account_id
    )
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
    _require_manual_cash_payment_account(
        session, entity_id, payload.payment_account_id
    )
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


def record_capital_contribution(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: CapitalContributionCreate,
) -> CapitalContributionResponse:
    note = payload.description.strip()
    if not note:
        raise ValueError("Note is required — why did this partner invest?")
    _require_manual_cash_payment_account(
        session, entity_id, payload.payment_account_id
    )
    result = partner_posting.post_capital_contribution(
        session,
        entity_id,
        partner_id,
        contribution_date=payload.contribution_date,
        amount_kurus=payload.amount_kurus,
        description=note,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
    )
    return CapitalContributionResponse(
        journal_entry_id=result.journal_entry.id,
        partner_ledger_entry=_partner_entry_read(
            session, result.partner_ledger_entry, entity_id=entity_id
        ),
        balance_kurus=result.balance_kurus,
    )


def record_profit_paid(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: ProfitPaidCreate,
) -> ProfitPaidResponse:
    """Manual Pay profit — cash drawer only. Bank payouts classify on the statement."""
    _require_manual_cash_payment_account(
        session, entity_id, payload.payment_account_id
    )
    result = partner_posting.post_profit_paid(
        session,
        entity_id,
        partner_id,
        payment_date=payload.payment_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description.strip(),
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
    )
    return ProfitPaidResponse(
        journal_entry_id=result.journal_entry.id,
        partner_ledger_entry=_partner_entry_read(
            session, result.partner_ledger_entry, entity_id=entity_id
        ),
        unpaid_profit_kurus=result.unpaid_profit_kurus,
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

    if movement_type == PartnerMovementType.PROFIT_SETTLEMENT:
        raise CorrectionNotFoundError(
            "profit allocation must be voided at entity level, not per-partner correct"
        )

    if movement_type == PartnerMovementType.PROFIT_PAID:
        raise CorrectionNotFoundError(
            "profit payment must be voided, not corrected in place"
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
        if partner_row.movement_type.value in (
            "profit_allocation",
            "profit_settlement",
        ):
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


def _netting_as_of(
    *,
    period_to: date | None,
    allocation_date: date | None,
) -> date:
    """Movements after this date are ignored when netting profit against amount taken."""
    if period_to is not None:
        return period_to
    if allocation_date is not None:
        return allocation_date
    raise ValueError("allocation_date is required when period_to is not set")


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
        session,
        entity_id,
        profit_kurus=profit_kurus,
        net_against_drawings=payload.net_against_drawings,
        netting_as_of=_netting_as_of(
            period_to=payload.period_to,
            allocation_date=payload.allocation_date,
        ),
    )
    return ProfitAllocationPreviewRead(
        total_profit_kurus=preview.total_profit_kurus,
        total_allocated_kurus=sum(line.amount_kurus for line in preview.splits),
        net_against_drawings=payload.net_against_drawings,
        netting_as_of=preview.netting_as_of,
        lines=[
            ProfitAllocationPreviewLine(
                partner_id=line.partner_id,
                partner_name=line.partner_name,
                ownership_share_pct=line.ownership_share_pct,
                amount_kurus=line.amount_kurus,
                gross_amount_kurus=line.gross_amount_kurus,
                net_balance_before_kurus=line.net_balance_before_kurus,
                offset_kurus=line.offset_kurus,
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
        net_against_drawings=payload.net_against_drawings,
        netting_as_of=_netting_as_of(
            period_to=payload.period_to,
            allocation_date=payload.allocation_date,
        ),
    )
    with entity_context(session, entity_id):
        require_entity_context()
        partner_reads = _partner_entry_reads(
            session, list(result.partner_ledger_entries)
        )
    capital_allocated = sum(
        entry.amount_kurus
        for entry in result.partner_ledger_entries
        if entry.movement_type == PartnerMovementType.PROFIT_ALLOCATION
    )
    return ProfitAllocationPostOut(
        journal_entry_id=result.journal_entry.id,
        total_profit_kurus=profit_kurus,
        total_allocated_kurus=capital_allocated,
        net_against_drawings=payload.net_against_drawings,
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
