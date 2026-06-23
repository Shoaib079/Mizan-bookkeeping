"""Subledger-safe journal entry corrections — registry and type-specific flows (Phase 8.5)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from typing import Callable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import ACCOUNTS_PAYABLE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.expenses.posting import build_expense_entry_lines
from app.core.fx.ledger import record_fx_movement
from app.core.fx.models import FxLedgerEntry
from app.core.fx.posting import build_fx_purchase_posting_lines
from app.core.fx.types import FxMovementType
from app.core.invoices.posting import build_invoice_posting_lines
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import (
    EntryNotFoundError,
    InvalidAccountError,
    PostingLine,
    _correct_journal_entry_in_transaction,
    _get_voidable_entry,
)
from app.core.payables import ledger as payables_ledger
from app.core.payables import posting as payables_posting
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.core.receivables import ledger as receivables_ledger
from app.core.receivables import posting as receivables_posting
from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables.types import CustomerMovementType
from app.core.staff import ledger as staff_ledger
from app.core.staff.models import StaffLedgerEntry
from app.core.partners import ledger as partner_ledger
from app.core.partners.models import PartnerLedgerEntry
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.expenses.models import ExpenseEntry
from app.features.invoices.models import InvoiceDraft
from app.features.tips.models import TipAccrual, TipPayout


class SubledgerBackedCorrectionError(ValueError):
    """Generic ledger correct rejected — use the type-specific correction flow."""


class CorrectionNotFoundError(LookupError):
    """No subledger row linked to the journal entry."""


SUBLEDGER_BACKED_SOURCES: dict[JournalEntrySource, str] = {
    JournalEntrySource.PAYMENT: "supplier payment correction",
    JournalEntrySource.INVOICE: "supplier invoice correction",
    JournalEntrySource.CUSTOMER_CREDIT_SALE: "customer credit sale correction",
    JournalEntrySource.CUSTOMER_PAYMENT_RECEIVED: "customer payment correction",
    JournalEntrySource.FX_PURCHASE: "FX purchase correction",
    JournalEntrySource.FX_CONVERSION: "FX conversion correction",
    JournalEntrySource.FX_EXPENSE_SPEND: "FX expense spend correction",
    JournalEntrySource.STAFF_ACCRUAL: "staff accrual correction",
    JournalEntrySource.STAFF_ADVANCE: "staff advance correction",
    JournalEntrySource.STAFF_PAYMENT: "staff payment correction",
    JournalEntrySource.PARTNER_EXPENSE_FRONTED: "partner expense correction",
    JournalEntrySource.PARTNER_REIMBURSEMENT_PAID: "partner reimbursement correction",
    JournalEntrySource.TIP_ACCRUAL: "tip accrual correction",
    JournalEntrySource.TIP_PAYOUT: "tip payout correction",
    JournalEntrySource.EXPENSE_ENTRY: "expense entry correction",
}


def resolve_correction_route(source: JournalEntrySource) -> str:
    """Human-readable message naming the required correction flow."""
    flow = SUBLEDGER_BACKED_SOURCES.get(source)
    if flow is None:
        return f"use the dedicated correction flow for source {source.value}"
    return f"use the {flow} flow"


def is_subledger_backed_source(source: JournalEntrySource) -> bool:
    return source in SUBLEDGER_BACKED_SOURCES


@dataclass(frozen=True, slots=True)
class SubledgerCorrectionResult:
    original: JournalEntry
    reversal: JournalEntry
    corrected: JournalEntry


def _effective_void_date(void_date: date | None, reversal: JournalEntry) -> date:
    return void_date or reversal.entry_date


def _run_subledger_correction_with_setup(
    session: Session,
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
    entry_date: date,
    description: str,
    build_lines: Callable[[Session], list[PostingLine]],
    *,
    actor_id: uuid.UUID,
    reason: str | None,
    void_date: date | None,
    after_gl: Callable[[Session, JournalEntry, JournalEntry, JournalEntry], None],
) -> SubledgerCorrectionResult:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        lines = build_lines(session)
        original, reversal, corrected = _correct_journal_entry_in_transaction(
            session,
            entity_id,
            entry_id,
            entry_date,
            description,
            lines,
            actor_id=actor_id,
            reason=reason,
            void_date=void_date,
        )
        after_gl(session, original, reversal, corrected)
        session.commit()
        session.refresh(original)
        session.refresh(reversal)
        session.refresh(corrected)
        return SubledgerCorrectionResult(
            original=original, reversal=reversal, corrected=corrected
        )


def _run_subledger_correction(
    session: Session,
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
    entry_date: date,
    description: str,
    lines: list[PostingLine],
    *,
    actor_id: uuid.UUID,
    reason: str | None,
    void_date: date | None,
    after_gl: Callable[[Session, JournalEntry, JournalEntry, JournalEntry], None],
) -> SubledgerCorrectionResult:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        original, reversal, corrected = _correct_journal_entry_in_transaction(
            session,
            entity_id,
            entry_id,
            entry_date,
            description,
            lines,
            actor_id=actor_id,
            reason=reason,
            void_date=void_date,
        )
        after_gl(session, original, reversal, corrected)
        session.commit()
        session.refresh(original)
        session.refresh(reversal)
        session.refresh(corrected)
        return SubledgerCorrectionResult(
            original=original, reversal=reversal, corrected=corrected
        )


def _append_supplier_reversal(
    session: Session,
    original: SupplierLedgerEntry,
    reversal: JournalEntry,
    *,
    actor_id: uuid.UUID,
    void_date: date | None,
) -> SupplierLedgerEntry:
    entry = SupplierLedgerEntry(
        supplier_id=original.supplier_id,
        movement_date=_effective_void_date(void_date, reversal),
        movement_type=original.movement_type,
        amount_kurus=-original.amount_kurus,
        description=f"Void: {original.description}",
        actor_id=actor_id,
        journal_entry_id=reversal.id,
        reference_type=original.reference_type,
        reference_id=original.reference_id,
    )
    session.add(entry)
    session.flush()
    session.refresh(entry)
    return entry


def _append_customer_reversal(
    session: Session,
    original: CustomerLedgerEntry,
    reversal: JournalEntry,
    *,
    actor_id: uuid.UUID,
    void_date: date | None,
) -> CustomerLedgerEntry:
    entry = CustomerLedgerEntry(
        customer_id=original.customer_id,
        movement_date=_effective_void_date(void_date, reversal),
        movement_type=original.movement_type,
        amount_kurus=-original.amount_kurus,
        description=f"Void: {original.description}",
        actor_id=actor_id,
        journal_entry_id=reversal.id,
        reference_type=original.reference_type,
        reference_id=original.reference_id,
    )
    session.add(entry)
    session.flush()
    session.refresh(entry)
    return entry


def _append_fx_reversal(
    session: Session,
    original: FxLedgerEntry,
    reversal: JournalEntry,
    *,
    actor_id: uuid.UUID,
    void_date: date | None,
) -> FxLedgerEntry:
    entry = FxLedgerEntry(
        fx_money_account_id=original.fx_money_account_id,
        movement_date=_effective_void_date(void_date, reversal),
        movement_type=original.movement_type,
        native_quantity=-original.native_quantity,
        try_cost_kurus=-original.try_cost_kurus,
        description=f"Void: {original.description}",
        actor_id=actor_id,
        journal_entry_id=reversal.id,
    )
    session.add(entry)
    session.flush()
    session.refresh(entry)
    return entry


def _append_staff_reversal(
    session: Session,
    original: StaffLedgerEntry,
    reversal: JournalEntry,
    *,
    actor_id: uuid.UUID,
    void_date: date | None,
) -> StaffLedgerEntry:
    entry = StaffLedgerEntry(
        employee_id=original.employee_id,
        movement_date=_effective_void_date(void_date, reversal),
        movement_type=original.movement_type,
        amount_minor=-original.amount_minor,
        try_cost_kurus=-original.try_cost_kurus if original.try_cost_kurus is not None else None,
        description=f"Void: {original.description}",
        actor_id=actor_id,
        journal_entry_id=reversal.id,
        reference_type=original.reference_type,
        reference_id=original.reference_id,
    )
    session.add(entry)
    session.flush()
    session.refresh(entry)
    return entry


def _append_partner_reversal(
    session: Session,
    original: PartnerLedgerEntry,
    reversal: JournalEntry,
    *,
    actor_id: uuid.UUID,
    void_date: date | None,
) -> PartnerLedgerEntry:
    entry = PartnerLedgerEntry(
        partner_id=original.partner_id,
        movement_date=_effective_void_date(void_date, reversal),
        movement_type=original.movement_type,
        amount_kurus=-original.amount_kurus,
        description=f"Void: {original.description}",
        actor_id=actor_id,
        journal_entry_id=reversal.id,
        reference_type=original.reference_type,
        reference_id=original.reference_id,
    )
    session.add(entry)
    session.flush()
    session.refresh(entry)
    return entry


def _get_supplier_ledger_row(session: Session, journal_entry_id: uuid.UUID) -> SupplierLedgerEntry:
    row = session.scalar(
        select(SupplierLedgerEntry).where(
            SupplierLedgerEntry.journal_entry_id == journal_entry_id
        )
    )
    if row is None:
        raise CorrectionNotFoundError("supplier ledger entry not found for journal entry")
    return row


def _get_customer_ledger_row(session: Session, journal_entry_id: uuid.UUID) -> CustomerLedgerEntry:
    row = session.scalar(
        select(CustomerLedgerEntry).where(
            CustomerLedgerEntry.journal_entry_id == journal_entry_id
        )
    )
    if row is None:
        raise CorrectionNotFoundError("customer ledger entry not found for journal entry")
    return row


def _get_fx_ledger_row(session: Session, journal_entry_id: uuid.UUID) -> FxLedgerEntry:
    row = session.scalar(
        select(FxLedgerEntry).where(FxLedgerEntry.journal_entry_id == journal_entry_id)
    )
    if row is None:
        raise CorrectionNotFoundError("FX ledger entry not found for journal entry")
    return row


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
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
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
        current = session.scalar(
            select(func.coalesce(func.sum(SupplierLedgerEntry.amount_kurus), 0)).where(
                SupplierLedgerEntry.supplier_id == supplier_id
            )
        )
        if int(current or 0) + old_payment - amount_kurus < 0:
            raise payables_ledger.OverpaymentError(
                f"Payment of {amount_kurus} kuruş exceeds payable balance"
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
        after_gl=after_gl,
    )


def correct_customer_payment(
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
) -> SubledgerCorrectionResult:
    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    from app.core.chart_of_accounts.default_chart import ACCOUNTS_RECEIVABLE_CODE

    with entity_context(session, entity_id):
        require_entity_context()
        original_row = _get_customer_ledger_row(session, journal_entry_id)
        if original_row.movement_type != CustomerMovementType.PAYMENT_RECEIVED:
            raise CorrectionNotFoundError("journal entry is not a customer payment")
        customer_id = original_row.customer_id
        old_payment = -original_row.amount_kurus
        current = session.scalar(
            select(func.coalesce(func.sum(CustomerLedgerEntry.amount_kurus), 0)).where(
                CustomerLedgerEntry.customer_id == customer_id
            )
        )
        if int(current or 0) + old_payment - amount_kurus < 0:
            raise receivables_ledger.OverpaymentError(
                f"Payment of {amount_kurus} exceeds receivable balance"
            )

    def after_gl(
        sess: Session,
        _original: JournalEntry,
        reversal: JournalEntry,
        corrected: JournalEntry,
    ) -> None:
        original_row = _get_customer_ledger_row(sess, journal_entry_id)
        customer_id = original_row.customer_id

        _append_customer_reversal(
            sess, original_row, reversal, actor_id=actor_id, void_date=void_date
        )
        receivables_ledger.persist_customer_ledger_entry(
            sess,
            customer_id,
            movement_date=payment_date,
            movement_type=CustomerMovementType.PAYMENT_RECEIVED,
            amount_kurus=-amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=corrected.id,
            reference_type=original_row.reference_type,
            reference_id=original_row.reference_id,
        )

    def build_lines(sess: Session) -> list[PostingLine]:
        ar_account = sess.scalar(
            select(Account).where(Account.code == ACCOUNTS_RECEIVABLE_CODE)
        )
        if ar_account is None:
            raise InvalidAccountError("accounts receivable account not found")
        return receivables_posting.build_customer_payment_lines(
            ar_account_id=ar_account.id,
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
        after_gl=after_gl,
    )


def correct_fx_purchase(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    purchase_date: date,
    native_quantity: int,
    try_cost_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    fx_money_account_id: uuid.UUID | None = None,
    try_cash_money_account_id: uuid.UUID | None = None,
    reason: str | None = None,
    void_date: date | None = None,
) -> SubledgerCorrectionResult:
    from app.features.banking.models import MoneyAccount

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    def after_gl(
        sess: Session,
        _original: JournalEntry,
        reversal: JournalEntry,
        corrected: JournalEntry,
    ) -> None:
        original_row = _get_fx_ledger_row(sess, journal_entry_id)
        if original_row.movement_type != FxMovementType.PURCHASE:
            raise CorrectionNotFoundError("journal entry is not an FX purchase")

        fx_account_id = fx_money_account_id or original_row.fx_money_account_id
        _append_fx_reversal(
            sess, original_row, reversal, actor_id=actor_id, void_date=void_date
        )
        record_fx_movement(
            sess,
            fx_account_id,
            movement_date=purchase_date,
            movement_type=FxMovementType.PURCHASE,
            native_quantity=native_quantity,
            try_cost_kurus=try_cost_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=corrected.id,
        )

    def build_lines(sess: Session) -> list[PostingLine]:
        original_row = _get_fx_ledger_row(sess, journal_entry_id)
        fx_account_id = fx_money_account_id or original_row.fx_money_account_id
        fx_money = sess.get(MoneyAccount, fx_account_id)
        if fx_money is None:
            raise LookupError("FX money account not found")

        original_je = _get_voidable_entry(sess, journal_entry_id)
        credit_line = next(
            (line for line in original_je.lines if line.side == AccountNormalBalance.CREDIT),
            None,
        )
        if credit_line is None:
            raise CorrectionNotFoundError("FX purchase journal entry missing credit line")

        try_cash_gl_id = credit_line.account_id
        if try_cash_money_account_id is not None:
            try_cash = sess.get(MoneyAccount, try_cash_money_account_id)
            if try_cash is None:
                raise LookupError("TRY cash money account not found")
            try_cash_gl_id = try_cash.gl_account_id

        return build_fx_purchase_posting_lines(
            fx_gl_account_id=fx_money.gl_account_id,
            try_cash_gl_account_id=try_cash_gl_id,
            try_cost_kurus=try_cost_kurus,
        )

    return _run_subledger_correction_with_setup(
        session,
        entity_id,
        journal_entry_id,
        purchase_date,
        description,
        build_lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        after_gl=after_gl,
    )


def correct_gl_with_subledger_rows(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    entry_date: date,
    description: str,
    lines: list[PostingLine],
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    supplier_row: SupplierLedgerEntry | None = None,
    customer_row: CustomerLedgerEntry | None = None,
    fx_row: FxLedgerEntry | None = None,
    staff_row: StaffLedgerEntry | None = None,
    partner_row: PartnerLedgerEntry | None = None,
    new_supplier_row: Callable[[Session, JournalEntry], None] | None = None,
    new_customer_row: Callable[[Session, JournalEntry], None] | None = None,
    new_fx_row: Callable[[Session, JournalEntry], None] | None = None,
    new_staff_row: Callable[[Session, JournalEntry], None] | None = None,
    new_partner_row: Callable[[Session, JournalEntry], None] | None = None,
    update_mutable: Callable[[Session, JournalEntry], None] | None = None,
) -> SubledgerCorrectionResult:
    """Generic GL correct with optional subledger reversal/append and mutable detail sync."""

    def after_gl(
        sess: Session,
        _original: JournalEntry,
        reversal: JournalEntry,
        corrected: JournalEntry,
    ) -> None:
        if supplier_row is not None:
            _append_supplier_reversal(
                sess, supplier_row, reversal, actor_id=actor_id, void_date=void_date
            )
        if customer_row is not None:
            _append_customer_reversal(
                sess, customer_row, reversal, actor_id=actor_id, void_date=void_date
            )
        if fx_row is not None:
            _append_fx_reversal(sess, fx_row, reversal, actor_id=actor_id, void_date=void_date)
        if staff_row is not None:
            _append_staff_reversal(
                sess, staff_row, reversal, actor_id=actor_id, void_date=void_date
            )
        if partner_row is not None:
            _append_partner_reversal(
                sess, partner_row, reversal, actor_id=actor_id, void_date=void_date
            )
        if new_supplier_row is not None:
            new_supplier_row(sess, corrected)
        if new_customer_row is not None:
            new_customer_row(sess, corrected)
        if new_fx_row is not None:
            new_fx_row(sess, corrected)
        if new_staff_row is not None:
            new_staff_row(sess, corrected)
        if new_partner_row is not None:
            new_partner_row(sess, corrected)
        if update_mutable is not None:
            update_mutable(sess, corrected)

    return _run_subledger_correction(
        session,
        entity_id,
        journal_entry_id,
        entry_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        after_gl=after_gl,
    )


def correct_credit_sale(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    sale_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    revenue_account_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
) -> SubledgerCorrectionResult:
    from app.core.chart_of_accounts.default_chart import ACCOUNTS_RECEIVABLE_CODE

    with entity_context(session, entity_id):
        require_entity_context()
        original_row = _get_customer_ledger_row(session, journal_entry_id)
        if original_row.movement_type != CustomerMovementType.CREDIT_SALE:
            raise CorrectionNotFoundError("journal entry is not a credit sale")

        customer_id = original_row.customer_id
        ar_account = session.scalar(
            select(Account).where(Account.code == ACCOUNTS_RECEIVABLE_CODE)
        )
        if ar_account is None:
            raise InvalidAccountError("accounts receivable account not found")

        lines = receivables_posting.build_credit_sale_lines(
            ar_account_id=ar_account.id,
            revenue_account_id=revenue_account_id,
            amount_kurus=amount_kurus,
        )

        def new_row(sess: Session, corrected: JournalEntry) -> None:
            receivables_ledger.persist_customer_ledger_entry(
                sess,
                customer_id,
                movement_date=sale_date,
                movement_type=CustomerMovementType.CREDIT_SALE,
                amount_kurus=amount_kurus,
                description=description,
                actor_id=actor_id,
                journal_entry_id=corrected.id,
            )

    return correct_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        sale_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        customer_row=original_row,
        new_customer_row=new_row,
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
) -> SubledgerCorrectionResult:
    from app.core.chart_of_accounts.default_chart import INPUT_VAT_CODE

    with entity_context(session, entity_id):
        require_entity_context()
        original_row = _get_supplier_ledger_row(session, journal_entry_id)
        if original_row.movement_type != SupplierMovementType.INVOICE:
            raise CorrectionNotFoundError("journal entry is not a supplier invoice")

        supplier_id = original_row.supplier_id
        draft = session.scalar(
            select(InvoiceDraft).where(InvoiceDraft.journal_entry_id == journal_entry_id)
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

    return correct_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        invoice_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        supplier_row=original_row,
        new_supplier_row=new_row,
        update_mutable=update_draft,
    )


def correct_expense_entry(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    expense_date: date,
    amount_kurus: int,
    expense_account_id: uuid.UUID,
    money_account_id: uuid.UUID,
    description: str,
    actor_id: uuid.UUID,
    written_item_description: str | None = None,
    expense_item_id: uuid.UUID | None = None,
    reason: str | None = None,
    void_date: date | None = None,
) -> SubledgerCorrectionResult:
    from app.features.banking.models import MoneyAccount

    with entity_context(session, entity_id):
        require_entity_context()
        expense = session.scalar(
            select(ExpenseEntry).where(ExpenseEntry.journal_entry_id == journal_entry_id)
        )
        if expense is None:
            raise CorrectionNotFoundError("expense entry not found for journal entry")

        money_account = session.get(MoneyAccount, money_account_id)
        if money_account is None:
            raise LookupError("money account not found")

        lines = build_expense_entry_lines(
            expense_account_id=expense_account_id,
            payment_gl_account_id=money_account.gl_account_id,
            amount_kurus=amount_kurus,
        )

        def update_expense(sess: Session, corrected: JournalEntry) -> None:
            expense.expense_date = expense_date
            expense.amount_kurus = amount_kurus
            expense.expense_account_id = expense_account_id
            expense.money_account_id = money_account_id
            expense.description = description
            expense.written_item_description = written_item_description
            expense.expense_item_id = expense_item_id
            expense.actor_id = actor_id
            expense.journal_entry_id = corrected.id
            sess.flush()

    return correct_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        expense_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        update_mutable=update_expense,
    )


def correct_staff_journal_entry(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    entry_date: date,
    description: str,
    lines: list[PostingLine],
    *,
    actor_id: uuid.UUID,
    amount_minor: int | None = None,
    try_cost_kurus: int | None = None,
    reason: str | None = None,
    void_date: date | None = None,
) -> SubledgerCorrectionResult:
    with entity_context(session, entity_id):
        require_entity_context()
        staff_row = session.scalar(
            select(StaffLedgerEntry).where(
                StaffLedgerEntry.journal_entry_id == journal_entry_id
            )
        )
        if staff_row is None:
            raise CorrectionNotFoundError("staff ledger entry not found for journal entry")

        fx_row = session.scalar(
            select(FxLedgerEntry).where(FxLedgerEntry.journal_entry_id == journal_entry_id)
        )

        employee_id = staff_row.employee_id
        movement_type = staff_row.movement_type
        new_amount_minor = amount_minor if amount_minor is not None else staff_row.amount_minor
        new_try_cost = try_cost_kurus if try_cost_kurus is not None else staff_row.try_cost_kurus

        def new_staff(sess: Session, corrected: JournalEntry) -> None:
            staff_ledger.persist_staff_ledger_entry(
                sess,
                employee_id,
                movement_date=entry_date,
                movement_type=movement_type,
                amount_minor=new_amount_minor,
                try_cost_kurus=new_try_cost,
                description=description,
                actor_id=actor_id,
                journal_entry_id=corrected.id,
                reference_type=staff_row.reference_type,
                reference_id=staff_row.reference_id,
            )

        def new_fx(sess: Session, corrected: JournalEntry) -> None:
            if fx_row is not None:
                record_fx_movement(
                    sess,
                    fx_row.fx_money_account_id,
                    movement_date=entry_date,
                    movement_type=fx_row.movement_type,
                    native_quantity=fx_row.native_quantity,
                    try_cost_kurus=fx_row.try_cost_kurus,
                    description=description,
                    actor_id=actor_id,
                    journal_entry_id=corrected.id,
                )

    return correct_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        entry_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        staff_row=staff_row,
        fx_row=fx_row,
        new_staff_row=new_staff,
        new_fx_row=new_fx if fx_row is not None else None,
    )


def correct_partner_journal_entry(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    entry_date: date,
    description: str,
    lines: list[PostingLine],
    *,
    actor_id: uuid.UUID,
    amount_kurus: int | None = None,
    reason: str | None = None,
    void_date: date | None = None,
) -> SubledgerCorrectionResult:
    with entity_context(session, entity_id):
        require_entity_context()
        partner_row = session.scalar(
            select(PartnerLedgerEntry).where(
                PartnerLedgerEntry.journal_entry_id == journal_entry_id
            )
        )
        if partner_row is None:
            raise CorrectionNotFoundError("partner ledger entry not found for journal entry")

        partner_id = partner_row.partner_id
        movement_type = partner_row.movement_type
        new_amount_kurus = amount_kurus if amount_kurus is not None else partner_row.amount_kurus

        def new_row(sess: Session, corrected: JournalEntry) -> None:
            partner_ledger.persist_partner_ledger_entry(
                sess,
                partner_id,
                movement_date=entry_date,
                movement_type=movement_type,
                amount_kurus=new_amount_kurus,
                description=description,
                actor_id=actor_id,
                journal_entry_id=corrected.id,
                reference_type=partner_row.reference_type,
                reference_id=partner_row.reference_id,
            )

    return correct_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        entry_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        partner_row=partner_row,
        new_partner_row=new_row,
    )


def correct_tip_accrual(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    entry_date: date,
    description: str,
    lines: list[PostingLine],
    *,
    actor_id: uuid.UUID,
    amount_kurus: int,
    reason: str | None = None,
    void_date: date | None = None,
) -> SubledgerCorrectionResult:
    with entity_context(session, entity_id):
        require_entity_context()
        accrual = session.scalar(
            select(TipAccrual).where(TipAccrual.journal_entry_id == journal_entry_id)
        )
        if accrual is None:
            raise CorrectionNotFoundError("tip accrual not found for journal entry")

        def update_tip(sess: Session, corrected: JournalEntry) -> None:
            accrual.accrual_date = entry_date
            accrual.amount_kurus = amount_kurus
            accrual.description = description
            accrual.actor_id = actor_id
            accrual.journal_entry_id = corrected.id
            sess.flush()

    return correct_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        entry_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        update_mutable=update_tip,
    )


def correct_tip_payout(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    entry_date: date,
    description: str,
    lines: list[PostingLine],
    *,
    actor_id: uuid.UUID,
    amount_kurus: int,
    reason: str | None = None,
    void_date: date | None = None,
) -> SubledgerCorrectionResult:
    with entity_context(session, entity_id):
        require_entity_context()
        payout = session.scalar(
            select(TipPayout).where(TipPayout.journal_entry_id == journal_entry_id)
        )
        if payout is None:
            raise CorrectionNotFoundError("tip payout not found for journal entry")

        def update_tip(sess: Session, corrected: JournalEntry) -> None:
            payout.payout_date = entry_date
            payout.amount_kurus = amount_kurus
            payout.description = description
            payout.actor_id = actor_id
            payout.journal_entry_id = corrected.id
            sess.flush()

    return correct_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        entry_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        update_mutable=update_tip,
    )


def correct_fx_conversion_or_spend(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    entry_date: date,
    description: str,
    lines: list[PostingLine],
    *,
    actor_id: uuid.UUID,
    native_quantity: int,
    try_cost_kurus: int,
    reason: str | None = None,
    void_date: date | None = None,
) -> SubledgerCorrectionResult:
    with entity_context(session, entity_id):
        require_entity_context()
        fx_row = _get_fx_ledger_row(session, journal_entry_id)
        fx_account_id = fx_row.fx_money_account_id
        movement_type = fx_row.movement_type

        def new_fx(sess: Session, corrected: JournalEntry) -> None:
            record_fx_movement(
                sess,
                fx_account_id,
                movement_date=entry_date,
                movement_type=movement_type,
                native_quantity=native_quantity,
                try_cost_kurus=try_cost_kurus,
                description=description,
                actor_id=actor_id,
                journal_entry_id=corrected.id,
            )

    return correct_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        entry_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        fx_row=fx_row,
        new_fx_row=new_fx,
    )
