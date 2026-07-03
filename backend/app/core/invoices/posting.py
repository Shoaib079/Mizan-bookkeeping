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
    validate_posting_lines,
)
from app.core.payables.ledger import persist_supplier_credit_note_entry, persist_supplier_invoice_entry
from app.core.payables.models import SupplierLedgerEntry
from app.db.base import utcnow
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.invoices.invoice_uniqueness import (
    live_posted_invoice_exists,
    live_posted_supplier_credit_exists,
    normalize_invoice_number,
)
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceKind
from app.features.invoices.supplier_expense_learning import (
    learn_supplier_expense_account,
    suggest_supplier_expense_account,
)
from app.features.payables.invoice_edit import expense_account_id_from_journal
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
    """GL pattern: debit expense + input VAT; credit AP for gross.

    Expense is gross minus all VAT lines (equals net when totals validate). Negative
    VAT lines (e.g. Getir line discounts) credit input VAT so debits equal credits.
    """
    validate_invoice_totals(net_kurus, gross_kurus, vat_breakdown)

    if vat_breakdown:
        vat_sum = sum(int(entry["vat_kurus"]) for entry in vat_breakdown)
        expense_kurus = gross_kurus - vat_sum
    else:
        expense_kurus = net_kurus
        vat_sum = gross_kurus - net_kurus

    lines: list[PostingLine] = [
        PostingLine(
            account_id=expense_account_id,
            amount_kurus=expense_kurus,
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
            elif vat_kurus < 0:
                lines.append(
                    PostingLine(
                        account_id=input_vat_account_id,
                        amount_kurus=abs(vat_kurus),
                        side=AccountNormalBalance.CREDIT,
                    )
                )
    elif vat_sum > 0:
        lines.append(
            PostingLine(
                account_id=input_vat_account_id,
                amount_kurus=vat_sum,
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
    validate_posting_lines(lines)
    return lines


def build_supplier_credit_posting_lines(
    *,
    expense_account_id: uuid.UUID,
    ap_account_id: uuid.UUID,
    input_vat_account_id: uuid.UUID,
    net_kurus: int,
    gross_kurus: int,
    vat_breakdown: list,
) -> list[PostingLine]:
    """Reverse supplier invoice pattern: credit expense + input VAT; debit AP."""
    lines = build_invoice_posting_lines(
        expense_account_id=expense_account_id,
        ap_account_id=ap_account_id,
        input_vat_account_id=input_vat_account_id,
        net_kurus=net_kurus,
        gross_kurus=gross_kurus,
        vat_breakdown=vat_breakdown,
    )
    reversed_lines = [
        PostingLine(
            account_id=line.account_id,
            amount_kurus=line.amount_kurus,
            side=(
                AccountNormalBalance.CREDIT
                if line.side == AccountNormalBalance.DEBIT
                else AccountNormalBalance.DEBIT
            ),
        )
        for line in lines
    ]
    validate_posting_lines(reversed_lines)
    return reversed_lines


def _expense_account_from_referenced_invoice(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    referenced_invoice_number: str,
) -> uuid.UUID | None:
    normalized = normalize_invoice_number(referenced_invoice_number)
    stmt = (
        select(InvoiceDraft)
        .where(
            InvoiceDraft.entity_id == entity_id,
            InvoiceDraft.supplier_id == supplier_id,
            InvoiceDraft.invoice_kind == InvoiceKind.SUPPLIER.value,
            InvoiceDraft.status == InvoiceDraftStatus.POSTED.value,
            func.lower(func.trim(InvoiceDraft.invoice_number)) == normalized,
        )
    )
    for draft in session.scalars(stmt):
        if normalize_invoice_number(draft.invoice_number) != normalized:
            continue
        if draft.journal_entry_id is None:
            continue
        journal = session.get(JournalEntry, draft.journal_entry_id)
        if journal is None:
            continue
        return expense_account_id_from_journal(session, entity_id, journal)
    return None


def _credit_note_description(draft: InvoiceDraft) -> str:
    description = f"İade {draft.invoice_number}"
    if draft.referenced_invoice_number:
        ref = draft.referenced_invoice_number
        if draft.referenced_invoice_date is not None:
            ref = f"{ref} ({draft.referenced_invoice_date.isoformat()})"
        description = f"{description} — iadeye konu fatura {ref}"
    return description


def post_supplier_credit_draft_to_ledger(
    session: Session,
    entity_id: uuid.UUID,
    draft: InvoiceDraft,
    *,
    expense_account_id: uuid.UUID | None,
    actor_id: uuid.UUID,
    journal_source: JournalEntrySource = JournalEntrySource.INVOICE,
) -> InvoicePostResult:
    """Post a supplier credit note (iade) draft to GL; caller holds entity_context."""
    require_entity_context()

    if InvoiceKind(draft.invoice_kind) != InvoiceKind.SUPPLIER_CREDIT:
        raise DraftPostError("Draft is not a supplier credit note")
    if draft.supplier_id is None:
        raise DraftPostError("Supplier must be linked before posting")

    if live_posted_supplier_credit_exists(
        session,
        entity_id,
        draft.supplier_id,
        draft.invoice_number,
        exclude_draft_id=draft.id,
    ):
        raise DraftPostError(
            f"Supplier already has a posted credit note with number {draft.invoice_number!r}"
        )

    status = InvoiceDraftStatus(draft.status)
    if status == InvoiceDraftStatus.POSTED:
        raise DraftPostError("Draft is already posted")
    if status not in {InvoiceDraftStatus.CONFIRMED, InvoiceDraftStatus.DRAFT, InvoiceDraftStatus.NEEDS_REVIEW}:
        raise DraftPostError(f"Draft status {status.value!r} cannot be posted")

    resolved_expense_id = expense_account_id
    if draft.referenced_invoice_number:
        from_referenced = _expense_account_from_referenced_invoice(
            session,
            entity_id,
            draft.supplier_id,
            draft.referenced_invoice_number,
        )
        if from_referenced is not None:
            resolved_expense_id = from_referenced

    if resolved_expense_id is None:
        suggestion = suggest_supplier_expense_account(
            session, entity_id, draft.supplier_id
        )
        if suggestion is not None:
            resolved_expense_id = suggestion.account_id

    if resolved_expense_id is None:
        raise DraftPostError("Expense account is required for supplier credit note posting")

    _validate_expense_account(session, entity_id, resolved_expense_id)

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
        lines = build_supplier_credit_posting_lines(
            expense_account_id=resolved_expense_id,
            ap_account_id=ap_account.id,
            input_vat_account_id=input_vat_account.id,
            net_kurus=draft.net_kurus,
            gross_kurus=draft.gross_kurus,
            vat_breakdown=draft.vat_breakdown,
        )
    except InvoiceTotalsError as exc:
        raise DraftPostError(str(exc)) from exc

    description = _credit_note_description(draft)
    journal_entry = prepare_journal_entry(
        session,
        entity_id,
        draft.invoice_date,
        description,
        lines,
        actor_id=actor_id,
        source=journal_source,
    )

    supplier_entry = persist_supplier_credit_note_entry(
        session,
        draft.supplier_id,
        movement_date=draft.invoice_date,
        amount_kurus=-draft.gross_kurus,
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

    suggestion = suggest_supplier_expense_account(
        session, entity_id, draft.supplier_id
    )
    learn_supplier_expense_account(
        session,
        entity_id,
        supplier_id=draft.supplier_id,
        expense_account_id=resolved_expense_id,
        suggested_account_id=suggestion.account_id if suggestion else None,
    )

    session.flush()
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


def post_supplier_invoice_draft_to_ledger(
    session: Session,
    entity_id: uuid.UUID,
    draft: InvoiceDraft,
    *,
    expense_account_id: uuid.UUID,
    actor_id: uuid.UUID,
    journal_source: JournalEntrySource = JournalEntrySource.INVOICE,
) -> InvoicePostResult:
    """Post a supplier invoice draft to GL; caller holds entity_context and commits."""
    require_entity_context()

    if InvoiceKind(draft.invoice_kind) == InvoiceKind.DELIVERY_COMMISSION:
        raise DraftPostError(
            "Delivery commission drafts must use delivery commission posting"
        )
    if draft.supplier_id is None:
        raise DraftPostError("Supplier must be linked before posting")

    if live_posted_invoice_exists(
        session,
        entity_id,
        draft.supplier_id,
        draft.invoice_number,
        exclude_draft_id=draft.id,
    ):
        raise DraftPostError(
            f"Supplier already has a posted invoice with number {draft.invoice_number!r}"
        )

    status = InvoiceDraftStatus(draft.status)
    if status == InvoiceDraftStatus.POSTED:
        raise DraftPostError("Draft is already posted")
    if status not in {InvoiceDraftStatus.CONFIRMED, InvoiceDraftStatus.DRAFT, InvoiceDraftStatus.NEEDS_REVIEW}:
        raise DraftPostError(f"Draft status {status.value!r} cannot be posted")

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
        source=journal_source,
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

    suggestion = suggest_supplier_expense_account(
        session, entity_id, draft.supplier_id
    )
    learn_supplier_expense_account(
        session,
        entity_id,
        supplier_id=draft.supplier_id,
        expense_account_id=expense_account_id,
        suggested_account_id=suggestion.account_id if suggestion else None,
    )

    session.flush()
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

        if InvoiceKind(draft.invoice_kind) == InvoiceKind.SUPPLIER_CREDIT:
            result = post_supplier_credit_draft_to_ledger(
                session,
                entity_id,
                draft,
                expense_account_id=expense_account_id,
                actor_id=actor_id,
            )
        else:
            result = post_supplier_invoice_draft_to_ledger(
                session,
                entity_id,
                draft,
                expense_account_id=expense_account_id,
                actor_id=actor_id,
            )
        session.commit()
        session.refresh(result.journal_entry)
        session.refresh(result.supplier_ledger_entry)
        session.refresh(draft)
        return result
