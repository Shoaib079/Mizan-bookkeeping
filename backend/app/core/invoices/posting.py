"""Confirmed invoice draft → GL + payables ledger (Decisions §7, §11)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_PAYABLE_CODE,
    INPUT_VAT_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import (
    InvalidAccountError,
    PostingLine,
    prepare_journal_entry,
)
from app.core.payables.ledger import persist_supplier_invoice_entry
from app.core.payables.models import SupplierLedgerEntry
from app.db.base import utcnow
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus
from app.features.invoices.validation import InvoiceTotalsError, validate_invoice_totals


class DraftPostError(ValueError):
    """Draft cannot be posted to ledger."""


@dataclass(frozen=True, slots=True)
class InvoicePostResult:
    journal_entry: JournalEntry
    supplier_ledger_entry: SupplierLedgerEntry
    payable_balance_kurus: int


def build_invoice_posting_lines(
    *,
    expense_account_id: uuid.UUID,
    ap_account_id: uuid.UUID,
    input_vat_account_id: uuid.UUID,
    net_kurus: int,
    gross_kurus: int,
    vat_breakdown: list,
) -> list[PostingLine]:
    """GL pattern: debit expense + input VAT; credit AP for gross."""
    validate_invoice_totals(net_kurus, gross_kurus, vat_breakdown)

    lines: list[PostingLine] = [
        PostingLine(
            account_id=expense_account_id,
            amount_kurus=net_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
    ]

    if vat_breakdown:
        for entry in vat_breakdown:
            vat_kurus = int(entry["vat_kurus"])
            if vat_kurus > 0:
                lines.append(
                    PostingLine(
                        account_id=input_vat_account_id,
                        amount_kurus=vat_kurus,
                        side=AccountNormalBalance.DEBIT,
                    )
                )
    else:
        vat_total = gross_kurus - net_kurus
        if vat_total > 0:
            lines.append(
                PostingLine(
                    account_id=input_vat_account_id,
                    amount_kurus=vat_total,
                    side=AccountNormalBalance.DEBIT,
                )
            )

    lines.append(
        PostingLine(
            account_id=ap_account_id,
            amount_kurus=gross_kurus,
            side=AccountNormalBalance.CREDIT,
        )
    )
    return lines


def _validate_expense_account(session: Session, entity_id: uuid.UUID, account_id: uuid.UUID) -> Account:
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


def post_confirmed_draft(
    session: Session,
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    *,
    expense_account_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> InvoicePostResult:
    """Post a confirmed draft to GL and supplier payables in one transaction."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        draft = session.get(InvoiceDraft, draft_id)
        if draft is None:
            raise LookupError("Invoice draft not found")
        status = InvoiceDraftStatus(draft.status)
        if status == InvoiceDraftStatus.POSTED:
            raise DraftPostError("Draft is already posted")
        if status != InvoiceDraftStatus.CONFIRMED:
            raise DraftPostError(
                f"Draft status {status.value!r} must be confirmed to post"
            )
        if draft.supplier_id is None:
            raise DraftPostError("Supplier must be linked before posting")

        _validate_expense_account(session, entity_id, expense_account_id)

        ap_account = session.scalar(
            select(Account).where(Account.code == ACCOUNTS_PAYABLE_CODE)
        )
        if ap_account is None:
            raise InvalidAccountError(
                f"accounts payable account {ACCOUNTS_PAYABLE_CODE} not found"
            )
        input_vat_account = session.scalar(
            select(Account).where(Account.code == INPUT_VAT_CODE)
        )
        if input_vat_account is None:
            raise InvalidAccountError(
                f"input VAT account {INPUT_VAT_CODE} not found"
            )

        try:
            lines = build_invoice_posting_lines(
                expense_account_id=expense_account_id,
                ap_account_id=ap_account.id,
                input_vat_account_id=input_vat_account.id,
                net_kurus=draft.net_kurus,
                gross_kurus=draft.gross_kurus,
                vat_breakdown=draft.vat_breakdown,
            )
        except InvoiceTotalsError as exc:
            raise DraftPostError(str(exc)) from exc

        description = f"Invoice {draft.invoice_number}"
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            draft.invoice_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.INVOICE,
        )

        supplier_entry = persist_supplier_invoice_entry(
            session,
            draft.supplier_id,
            movement_date=draft.invoice_date,
            amount_kurus=draft.gross_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
            reference_type="invoice_draft",
            reference_id=draft.id,
        )

        draft.status = InvoiceDraftStatus.POSTED
        draft.posted_at = utcnow()
        draft.posted_by = actor_id
        draft.journal_entry_id = journal_entry.id

        session.commit()
        session.refresh(journal_entry)
        session.refresh(supplier_entry)
        session.refresh(draft)
        _ = list(journal_entry.lines)

        balance = session.scalar(
            select(func.coalesce(func.sum(SupplierLedgerEntry.amount_kurus), 0)).where(
                SupplierLedgerEntry.supplier_id == draft.supplier_id
            )
        )
        return InvoicePostResult(
            journal_entry=journal_entry,
            supplier_ledger_entry=supplier_entry,
            payable_balance_kurus=int(balance or 0),
        )
