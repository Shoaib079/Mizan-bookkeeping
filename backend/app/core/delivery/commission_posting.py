"""Delivery commission e-Fatura GL posting — credits platform clearing (Decisions §9)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import INPUT_VAT_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.invoices.posting import DraftPostError, build_invoice_posting_lines
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.db.base import utcnow
from app.db.session import entity_context, require_entity_context
from app.features.delivery import platform_service
from app.features.entities import service as entity_service
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceKind
from app.features.invoices.validation import InvoiceTotalsError, validate_invoice_totals


@dataclass(frozen=True, slots=True)
class DeliveryCommissionPostResult:
    journal_entry: JournalEntry
    delivery_platform_id: uuid.UUID


def build_delivery_commission_posting_lines(
    *,
    expense_account_id: uuid.UUID,
    clearing_account_id: uuid.UUID,
    input_vat_account_id: uuid.UUID,
    net_kurus: int,
    gross_kurus: int,
    vat_breakdown: list,
) -> list[PostingLine]:
    """GL pattern: debit commission expense + input VAT; credit platform clearing (gross)."""
    invoice_lines = build_invoice_posting_lines(
        expense_account_id=expense_account_id,
        ap_account_id=clearing_account_id,
        input_vat_account_id=input_vat_account_id,
        net_kurus=net_kurus,
        gross_kurus=gross_kurus,
        vat_breakdown=vat_breakdown,
    )
    return [
        PostingLine(
            account_id=line.account_id,
            amount_kurus=line.amount_kurus,
            side=line.side,
        )
        for line in invoice_lines
    ]


def _validate_expense_account(
    session: Session, entity_id: uuid.UUID, account_id: uuid.UUID
) -> Account:
    account = session.get(Account, account_id)
    if account is None or account.entity_id != entity_id:
        raise InvalidAccountError("expense account not found for this entity")
    if not account.is_active:
        raise InvalidAccountError(f"account {account.code} is not active")
    if account.account_type != AccountType.EXPENSE:
        raise InvalidAccountError(
            f"account {account.code} is not an expense account"
        )
    return account


def post_delivery_commission_draft(
    session: Session,
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    *,
    expense_account_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> DeliveryCommissionPostResult:
    """Post a confirmed delivery commission draft — credits clearing, not AP."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        draft = session.get(InvoiceDraft, draft_id)
        if draft is None:
            raise LookupError("Invoice draft not found")

        if InvoiceKind(draft.invoice_kind) != InvoiceKind.DELIVERY_COMMISSION:
            raise DraftPostError("Draft is not a delivery commission invoice")

        status = InvoiceDraftStatus(draft.status)
        if status == InvoiceDraftStatus.POSTED:
            raise DraftPostError("Draft is already posted")
        if status != InvoiceDraftStatus.CONFIRMED:
            raise DraftPostError(
                f"Draft status {status.value!r} must be confirmed to post"
            )
        if draft.delivery_platform_id is None:
            raise DraftPostError("Delivery platform must be linked before posting")

        _validate_expense_account(session, entity_id, expense_account_id)

        platform = platform_service.get_delivery_platform_row(
            session, entity_id, draft.delivery_platform_id
        )
        clearing_account = session.get(Account, platform.gl_account_id)
        if clearing_account is None:
            raise InvalidAccountError("platform clearing account not found")

        input_vat_account = session.scalar(
            select(Account).where(Account.code == INPUT_VAT_CODE)
        )
        if input_vat_account is None:
            raise InvalidAccountError(
                f"input VAT account {INPUT_VAT_CODE} not found"
            )

        try:
            lines = build_delivery_commission_posting_lines(
                expense_account_id=expense_account_id,
                clearing_account_id=clearing_account.id,
                input_vat_account_id=input_vat_account.id,
                net_kurus=draft.net_kurus,
                gross_kurus=draft.gross_kurus,
                vat_breakdown=draft.vat_breakdown,
            )
        except InvoiceTotalsError as exc:
            raise DraftPostError(str(exc)) from exc

        description = f"Delivery commission {draft.invoice_number}"
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            draft.invoice_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.DELIVERY_COMMISSION,
        )

        draft.status = InvoiceDraftStatus.POSTED
        draft.posted_at = utcnow()
        draft.posted_by = actor_id
        draft.journal_entry_id = journal_entry.id

        session.commit()
        session.refresh(journal_entry)
        session.refresh(draft)
        _ = list(journal_entry.lines)

        return DeliveryCommissionPostResult(
            journal_entry=journal_entry,
            delivery_platform_id=platform.id,
        )
