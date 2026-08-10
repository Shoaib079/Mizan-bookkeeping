"""Correcting and voiding what a supplier sent, or was paid.

Lifted verbatim from `correction.py` when it was split.

Three documents live here and they are not interchangeable. An invoice
increases what is owed; a payment reduces it; a credit note (iade) reduces it
too, but is a different document on its own route — a caller that confuses one
for the other has the supplier balance wrong by twice the amount rather than
merely wrong.

`void_supplier_invoice` refuses a credit note by movement type and
`void_supplier_credit_note` refuses an invoice, deliberately and in both
directions. Until the second route existed the first one's refusal left a
wrong iade in the books permanently.
"""

from __future__ import annotations

from app.core.chart_of_accounts.default_chart import ACCOUNTS_PAYABLE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.invoices.posting import build_invoice_posting_lines
from app.core.ledger.correction.drafts import _draft_for_journal_entry, _release_posted_draft
from app.core.ledger.correction.machinery import SubledgerCorrectionResult, SubledgerVoidResult, _append_supplier_reversal, _get_supplier_ledger_row, _run_subledger_correction_with_setup, correct_gl_with_subledger_rows, void_gl_with_subledger_rows
from app.core.ledger.correction.registry import CorrectionNotFoundError
from app.core.ledger.models import JournalEntry
from app.core.ledger.posting import InvalidAccountError, PostingLine
from app.core.payables import ledger as payables_ledger
from app.core.payables import posting as payables_posting
from app.core.payables.advance import supplier_advance_kurus
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.invoices.models import InvoiceDraft
from app.features.invoices.supplier_expense_learning import learn_supplier_expense_account, suggest_supplier_expense_account
from app.features.payables import invoice_edit
from app.features.payables.advance_settings import get_supplier_advance_confirm_threshold_kurus
from datetime import date
from sqlalchemy import func, select
from sqlalchemy.orm import Session
import uuid


def correct_supplier_payment(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    payment_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
    confirm_advance: bool = False,
    skip_advance_confirm: bool = False,
) -> SubledgerCorrectionResult:
    if amount_kurus <= 0:
        raise ValueError("Payment amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        original_row = _get_supplier_ledger_row(session, journal_entry_id)
        if original_row.movement_type != SupplierMovementType.PAYMENT:
            raise CorrectionNotFoundError("journal entry is not a supplier payment")
        supplier_id = original_row.supplier_id
        old_payment = -original_row.amount_kurus
        current = int(
            session.scalar(
                select(func.coalesce(func.sum(SupplierLedgerEntry.amount_kurus), 0)).where(
                    SupplierLedgerEntry.supplier_id == supplier_id
                )
            )
            or 0
        )
        balance_without_payment = current + old_payment
        advance = supplier_advance_kurus(balance_without_payment, amount_kurus)
        if advance > 0 and not skip_advance_confirm:
            threshold = get_supplier_advance_confirm_threshold_kurus(session, entity_id)
            if advance > threshold and not confirm_advance:
                raise payables_ledger.AdvanceConfirmationRequiredError(
                    f"Corrected payment creates a supplier advance of {advance} kuruş — "
                    "confirm_advance is required for advances above the threshold"
                )

    def after_gl(
        sess: Session,
        _original: JournalEntry,
        reversal: JournalEntry,
        corrected: JournalEntry,
    ) -> None:
        original_row = _get_supplier_ledger_row(sess, journal_entry_id)
        supplier_id = original_row.supplier_id

        _append_supplier_reversal(
            sess, original_row, reversal, actor_id=actor_id, void_date=void_date
        )
        payables_posting.persist_supplier_payment_entry(
            sess,
            supplier_id,
            movement_date=payment_date,
            amount_kurus=-amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=corrected.id,
            reference_type=reference_type or original_row.reference_type,
            reference_id=reference_id or original_row.reference_id,
        )

    def build_lines(sess: Session) -> list[PostingLine]:
        ap_account = sess.scalar(
            select(Account).where(Account.code == ACCOUNTS_PAYABLE_CODE)
        )
        if ap_account is None:
            raise InvalidAccountError("accounts payable account not found")
        return payables_posting.build_supplier_payment_posting_lines(
            ap_account_id=ap_account.id,
            payment_account_id=payment_account_id,
            amount_kurus=amount_kurus,
        )

    return _run_subledger_correction_with_setup(
        session,
        entity_id,
        journal_entry_id,
        payment_date,
        description,
        build_lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        after_gl=after_gl,
    )


def correct_supplier_invoice(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    invoice_date: date,
    description: str,
    actor_id: uuid.UUID,
    expense_account_id: uuid.UUID,
    net_kurus: int,
    gross_kurus: int,
    vat_breakdown: list,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerCorrectionResult:
    from app.core.chart_of_accounts.default_chart import INPUT_VAT_CODE

    with entity_context(session, entity_id):
        require_entity_context()
        target_id = invoice_edit.resolve_supplier_invoice_edit_target(
            session, journal_entry_id
        )
        original_row = _get_supplier_ledger_row(session, target_id)
        if original_row.movement_type != SupplierMovementType.INVOICE:
            raise CorrectionNotFoundError("journal entry is not a supplier invoice")

        supplier_id = original_row.supplier_id
        draft = session.scalar(
            select(InvoiceDraft).where(InvoiceDraft.journal_entry_id == target_id)
        )

        ap_account = session.scalar(
            select(Account).where(Account.code == ACCOUNTS_PAYABLE_CODE)
        )
        input_vat = session.scalar(select(Account).where(Account.code == INPUT_VAT_CODE))
        if ap_account is None or input_vat is None:
            raise InvalidAccountError("chart accounts for invoice posting not found")

        lines = build_invoice_posting_lines(
            expense_account_id=expense_account_id,
            ap_account_id=ap_account.id,
            input_vat_account_id=input_vat.id,
            net_kurus=net_kurus,
            gross_kurus=gross_kurus,
            vat_breakdown=vat_breakdown,
        )

        def new_row(sess: Session, corrected: JournalEntry) -> None:
            payables_ledger.persist_supplier_invoice_entry(
                sess,
                supplier_id,
                movement_date=invoice_date,
                amount_kurus=gross_kurus,
                description=description,
                actor_id=actor_id,
                journal_entry_id=corrected.id,
                reference_type=original_row.reference_type or "invoice_draft",
                reference_id=original_row.reference_id or (draft.id if draft else None),
            )

        def update_draft(sess: Session, corrected: JournalEntry) -> None:
            if draft is not None:
                draft.journal_entry_id = corrected.id
                draft.net_kurus = net_kurus
                draft.gross_kurus = gross_kurus
                draft.vat_breakdown = vat_breakdown
                draft.invoice_date = invoice_date
            suggestion = suggest_supplier_expense_account(sess, entity_id, supplier_id)
            learn_supplier_expense_account(
                sess,
                entity_id,
                supplier_id=supplier_id,
                expense_account_id=expense_account_id,
                suggested_account_id=suggestion.account_id if suggestion else None,
            )

    return correct_gl_with_subledger_rows(
        session,
        entity_id,
        target_id,
        invoice_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        supplier_row=original_row,
        new_supplier_row=new_row,
        update_mutable=update_draft,
    )


def void_supplier_payment(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    with entity_context(session, entity_id):
        require_entity_context()
        original_row = _get_supplier_ledger_row(session, journal_entry_id)
        if original_row.movement_type != SupplierMovementType.PAYMENT:
            raise CorrectionNotFoundError("journal entry is not a supplier payment")

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        supplier_row=original_row,
    )


def void_supplier_invoice(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    with entity_context(session, entity_id):
        require_entity_context()
        original_row = _get_supplier_ledger_row(session, journal_entry_id)
        if original_row.movement_type != SupplierMovementType.INVOICE:
            raise CorrectionNotFoundError("journal entry is not a supplier invoice")
        draft = _draft_for_journal_entry(session, journal_entry_id)

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        supplier_row=original_row,
        after_gl=_release_posted_draft(draft),
    )


def void_supplier_credit_note(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    """Take a credit note (iade) back out of the books.

    A credit note posts under source `INVOICE` with a `CREDIT_NOTE` movement
    type, and `void_supplier_invoice` refuses it by movement type. Until now
    nothing else accepted it either, so a wrong iade was in the books
    permanently — the ledger honestly offered no buttons, which is better than
    buttons that 404 and still leaves you stuck.

    The machinery needed no changes. `void_gl_with_subledger_rows` reverses
    the GL and appends the supplier reversal whatever the movement type is,
    and `_release_posted_draft` hands the draft back so the same file can be
    uploaded again. Only the guard was in the way, and a guard that says "not
    an invoice" is right to refuse a caller asking to void an invoice — it was
    the missing second caller that was the problem.
    """
    with entity_context(session, entity_id):
        require_entity_context()
        original_row = _get_supplier_ledger_row(session, journal_entry_id)
        if original_row.movement_type != SupplierMovementType.CREDIT_NOTE:
            raise CorrectionNotFoundError("journal entry is not a supplier credit note")
        draft = _draft_for_journal_entry(session, journal_entry_id)

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        supplier_row=original_row,
        after_gl=_release_posted_draft(draft),
    )
