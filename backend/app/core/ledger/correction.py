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
from app.core.fx.posting import build_fx_purchase_posting_lines, record_fx_purchase_cash_movement
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
from app.core.payables.advance import supplier_advance_kurus
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.features.payables.advance_settings import (
    get_supplier_advance_confirm_threshold_kurus,
)
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
from app.features.invoices.models import (
    InvoiceDraft,
    InvoiceDraftStatus,
    InvoiceKind,
)
from app.features.invoices.supplier_expense_learning import (
    learn_supplier_expense_account,
    suggest_supplier_expense_account,
)
from app.features.payables import invoice_edit
from app.features.cash.models import CashMovement, CashMovementDirection
from app.core.cash.guards import resolve_session_for_movement


class SubledgerBackedCorrectionError(ValueError):
    """Generic ledger correct rejected — source is not standalone GL."""


class CorrectionNotFoundError(LookupError):
    """No subledger row linked to the journal entry."""


# Standalone GL entries with no paired feature/subledger record.
GENERIC_CORRECTABLE_SOURCES: frozenset[JournalEntrySource] = frozenset(
    {
        JournalEntrySource.MANUAL,
        JournalEntrySource.BANK_FEE,
        # Plain Dr commission / Cr clearing or bank — no feature subledger row.
        JournalEntrySource.POS_COMMISSION_SWEEP,
        JournalEntrySource.POS_COMMISSION_STATEMENT,
    }
)

# Type-specific correction flows (void + repost GL and paired subledger/detail atomically).
DEDICATED_CORRECTION_ROUTES: dict[JournalEntrySource, str] = {
    JournalEntrySource.PAYMENT: "supplier payment correction",
    JournalEntrySource.INVOICE: "supplier invoice correction",
    JournalEntrySource.CUSTOMER_CREDIT_SALE: "customer credit sale correction",
    JournalEntrySource.GROUP_SALE: "group sale correction",
    JournalEntrySource.CUSTOMER_PAYMENT_RECEIVED: "customer payment correction",
    JournalEntrySource.FX_PURCHASE: "FX purchase correction",
    JournalEntrySource.FX_CONVERSION: "FX conversion correction",
    JournalEntrySource.FX_EXPENSE_SPEND: "FX expense spend correction",
    JournalEntrySource.STAFF_ACCRUAL: "staff accrual correction",
    JournalEntrySource.STAFF_ADVANCE: "staff advance correction",
    JournalEntrySource.STAFF_PAYMENT: "staff payment correction",
    JournalEntrySource.PARTNER_EXPENSE_FRONTED: "partner expense correction",
    JournalEntrySource.PARTNER_REIMBURSEMENT_PAID: "partner reimbursement correction",
    JournalEntrySource.PARTNER_DRAWING: "partner drawing correction",
    JournalEntrySource.PARTNER_DRAWING_REPAYMENT: "partner drawing repayment correction",
    JournalEntrySource.EXPENSE_ENTRY: "expense entry correction",
    JournalEntrySource.PARTNER_PROFIT_ALLOCATION: "partner profit allocation correction",
    JournalEntrySource.DELIVERY_COMMISSION: "delivery commission invoice correction",
}

# Paired feature records with no dedicated correction API yet — never generic-correct.
# CARD_SALES / CASH_MOVEMENT from a posted PosDailySummary: use correct_pos_daily_summary().
VOID_AND_REENTER_SOURCES: frozenset[JournalEntrySource] = frozenset(
    {
        JournalEntrySource.OPENING_BALANCE,
        JournalEntrySource.TRANSFER,
        JournalEntrySource.POS_SETTLEMENT,
        JournalEntrySource.CARD_SALES,
        JournalEntrySource.POS_CARD_TIP,
        JournalEntrySource.DELIVERY_REPORT,
        JournalEntrySource.DELIVERY_SETTLEMENT,
        JournalEntrySource.CREDIT_CARD_PAYMENT,
        JournalEntrySource.CASH_MOVEMENT,
        JournalEntrySource.CASH_DRAWER_CLOSE,
        JournalEntrySource.RULE_AUTO,
        JournalEntrySource.SYSTEM,
        JournalEntrySource.PARTNER_PROFIT_PAID,
        JournalEntrySource.PARTNER_SUPPLIER_PAID,
        JournalEntrySource.EXPENSE_PERSONAL_SPLIT,
        JournalEntrySource.PARTNER_CAPITAL_CONTRIBUTION,
        JournalEntrySource.PARTNER_LOAN_RECEIVED,
        JournalEntrySource.PARTNER_LOAN_REPAID,
        # A year-end close is derived entirely from the year's balances, so
        # editing its amounts by hand is meaningless — the next read would
        # disagree with the books. Voiding it reopens the year for re-closing,
        # which recomputes from whatever the balances now say.
        JournalEntrySource.YEAR_END_CLOSE,
    }
)


def verify_correction_source_registry_complete() -> None:
    """Fail fast if a JournalEntrySource is not classified for generic correct."""
    all_sources = set(JournalEntrySource)
    classified = (
        set(GENERIC_CORRECTABLE_SOURCES)
        | set(DEDICATED_CORRECTION_ROUTES.keys())
        | set(VOID_AND_REENTER_SOURCES)
    )
    if classified != all_sources:
        missing = sorted(s.value for s in all_sources - classified)
        extra = sorted(s.value for s in classified - all_sources)
        raise AssertionError(
            f"correction registry incomplete: missing={missing!r} extra={extra!r}"
        )
    if GENERIC_CORRECTABLE_SOURCES & set(DEDICATED_CORRECTION_ROUTES.keys()):
        raise AssertionError("source cannot be both generic-correctable and dedicated")
    if GENERIC_CORRECTABLE_SOURCES & VOID_AND_REENTER_SOURCES:
        raise AssertionError("source cannot be both generic-correctable and void-and-reenter")
    if set(DEDICATED_CORRECTION_ROUTES.keys()) & VOID_AND_REENTER_SOURCES:
        raise AssertionError("source cannot be both dedicated and void-and-reenter")


def is_generic_correctable(source: JournalEntrySource) -> bool:
    return source in GENERIC_CORRECTABLE_SOURCES


def resolve_correction_route(source: JournalEntrySource) -> str:
    """Human-readable message naming the required correction flow."""
    if source in GENERIC_CORRECTABLE_SOURCES:
        raise ValueError(f"source {source.value} is generic-correctable")
    dedicated = DEDICATED_CORRECTION_ROUTES.get(source)
    if dedicated is not None:
        return f"use the {dedicated} flow"
    return "void the entry and re-enter"


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
    period_unlock_reason: str | None = None,
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
            period_unlock_reason=period_unlock_reason,
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
    period_unlock_reason: str | None = None,
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
            period_unlock_reason=period_unlock_reason,
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
        period_year=original.period_year,
        period_month=original.period_month,
        extra_days=original.extra_days,
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


def _get_cash_movement_for_journal(
    session: Session, journal_entry_id: uuid.UUID
) -> CashMovement | None:
    return session.scalar(
        select(CashMovement).where(CashMovement.journal_entry_id == journal_entry_id)
    )


def _append_cash_movement_reversal(
    session: Session,
    entity_id: uuid.UUID,
    original: CashMovement,
    reversal: JournalEntry,
    *,
    actor_id: uuid.UUID,
    void_date: date | None,
    period_unlock_reason: str | None = None,
) -> CashMovement:
    reversal_direction = (
        CashMovementDirection.IN
        if original.direction == CashMovementDirection.OUT
        else CashMovementDirection.OUT
    )
    reversal_date = _effective_void_date(void_date, reversal)
    session_id = resolve_session_for_movement(
        session,
        entity_id,
        money_account_id=original.money_account_id,
        session_date=reversal_date,
        actor_id=actor_id,
        unlock_reason=period_unlock_reason,
    )
    entry = CashMovement(
        session_id=session_id,
        money_account_id=original.money_account_id,
        movement_date=reversal_date,
        direction=reversal_direction,
        amount_kurus=original.amount_kurus,
        offset_account_id=original.offset_account_id,
        description=f"Void: {original.description}",
        actor_id=actor_id,
        journal_entry_id=reversal.id,
    )
    session.add(entry)
    session.flush()
    session.refresh(entry)
    return entry


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
    payment_native_quantity: int | None = None,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerCorrectionResult:
    from app.features.banking.models import MoneyAccount, MoneyAccountKind

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

        new_money_account = session.scalar(
            select(MoneyAccount).where(
                MoneyAccount.entity_id == entity_id,
                MoneyAccount.gl_account_id == payment_account_id,
            )
        )
        is_fx_wallet = (
            new_money_account is not None
            and new_money_account.account_kind == MoneyAccountKind.FOREIGN_CURRENCY
        )
        if is_fx_wallet:
            if payment_native_quantity is None or payment_native_quantity <= 0:
                raise ValueError(
                    "FX wallet payment requires a positive payment_native_quantity"
                )
        elif payment_native_quantity is not None:
            raise ValueError(
                "payment_native_quantity is only allowed for FX wallet receipts"
            )

    def after_gl(
        sess: Session,
        _original: JournalEntry,
        reversal: JournalEntry,
        corrected: JournalEntry,
    ) -> None:
        original_row = _get_customer_ledger_row(sess, journal_entry_id)
        customer_id = original_row.customer_id

        money_account = sess.scalar(
            select(MoneyAccount).where(
                MoneyAccount.entity_id == entity_id,
                MoneyAccount.gl_account_id == payment_account_id,
            )
        )
        corrected_is_fx = (
            money_account is not None
            and money_account.account_kind == MoneyAccountKind.FOREIGN_CURRENCY
        )

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
            forex_currency=money_account.currency if corrected_is_fx else None,
            payment_native_quantity=(
                payment_native_quantity if corrected_is_fx else None
            ),
        )

        original_fx = sess.scalar(
            select(FxLedgerEntry).where(
                FxLedgerEntry.journal_entry_id == journal_entry_id
            )
        )
        if original_fx is not None:
            _append_fx_reversal(
                sess, original_fx, reversal, actor_id=actor_id, void_date=void_date
            )
        if corrected_is_fx and money_account is not None:
            record_fx_movement(
                sess,
                money_account.id,
                movement_date=payment_date,
                movement_type=FxMovementType.RECEIPT,
                native_quantity=payment_native_quantity,
                try_cost_kurus=amount_kurus,
                description=description,
                actor_id=actor_id,
                journal_entry_id=corrected.id,
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
        period_unlock_reason=period_unlock_reason,
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
    period_unlock_reason: str | None = None,
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

        original_cash = _get_cash_movement_for_journal(sess, journal_entry_id)
        if original_cash is not None:
            _append_cash_movement_reversal(
                sess,
                entity_id,
                original_cash,
                reversal,
                actor_id=actor_id,
                void_date=void_date,
                period_unlock_reason=period_unlock_reason,
            )
            try_cash_id = try_cash_money_account_id or original_cash.money_account_id
            try_cash = sess.get(MoneyAccount, try_cash_id)
            if try_cash is None:
                raise LookupError("TRY cash money account not found")
            fx_money = sess.get(MoneyAccount, fx_account_id)
            if fx_money is None:
                raise LookupError("FX money account not found")
            record_fx_purchase_cash_movement(
                sess,
                entity_id,
                try_cash_account=try_cash,
                fx_gl_account_id=fx_money.gl_account_id,
                try_cost_kurus=try_cost_kurus,
                movement_date=purchase_date,
                description=description,
                actor_id=actor_id,
                journal_entry_id=corrected.id,
                period_unlock_reason=period_unlock_reason,
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
        period_unlock_reason=period_unlock_reason,
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
    period_unlock_reason: str | None = None,
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
        period_unlock_reason=period_unlock_reason,
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
    period_unlock_reason: str | None = None,
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
        period_unlock_reason=period_unlock_reason,
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


def correct_delivery_commission_invoice(
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
    """Correct a posted delivery commission invoice.

    The last invoice type that could only be voided and re-entered. It is an
    invoice like any other — an e-Fatura from a platform, reviewed with the
    rest — and it was void-only because nobody had written this, not because
    correcting it is unsound.

    Simpler than `correct_supplier_invoice`: a commission credits the
    platform's clearing account rather than payables, so there is no supplier
    subledger row to reverse and re-create. Only the GL lines and the draft.

    The clearing account comes from the platform on the *draft*, not from the
    old journal lines. Re-deriving it means a correction posts where a fresh
    invoice would, rather than inheriting an account that may since have been
    changed on the platform.
    """
    from app.core.chart_of_accounts.default_chart import INPUT_VAT_CODE
    from app.core.delivery.commission_posting import (
        build_delivery_commission_posting_lines,
    )
    from app.features.delivery import platform_service

    with entity_context(session, entity_id):
        require_entity_context()
        draft = _delivery_commission_draft(session, journal_entry_id)
        if draft.delivery_platform_id is None:
            raise CorrectionNotFoundError(
                "delivery commission has no platform linked"
            )

        platform = platform_service.get_delivery_platform_row(
            session, entity_id, draft.delivery_platform_id
        )
        clearing_account = session.get(Account, platform.gl_account_id)
        if clearing_account is None:
            raise InvalidAccountError("platform clearing account not found")
        input_vat = session.scalar(select(Account).where(Account.code == INPUT_VAT_CODE))
        if input_vat is None:
            raise InvalidAccountError(f"input VAT account {INPUT_VAT_CODE} not found")

        lines = build_delivery_commission_posting_lines(
            expense_account_id=expense_account_id,
            clearing_account_id=clearing_account.id,
            input_vat_account_id=input_vat.id,
            net_kurus=net_kurus,
            gross_kurus=gross_kurus,
            vat_breakdown=vat_breakdown,
        )

        def update_draft(sess: Session, corrected: JournalEntry) -> None:
            # The draft has to follow the entry, or the invoice screen keeps
            # showing the figures that were replaced and the KDV report reads
            # the old breakdown — both silently.
            draft.journal_entry_id = corrected.id
            draft.net_kurus = net_kurus
            draft.gross_kurus = gross_kurus
            draft.vat_breakdown = vat_breakdown
            draft.invoice_date = invoice_date
            sess.flush()

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
        period_unlock_reason=period_unlock_reason,
        update_mutable=update_draft,
    )


def _delivery_commission_draft(
    session: Session, journal_entry_id: uuid.UUID
) -> InvoiceDraft:
    draft = session.scalar(
        select(InvoiceDraft).where(InvoiceDraft.journal_entry_id == journal_entry_id)
    )
    if draft is None:
        raise CorrectionNotFoundError("invoice draft not found for journal entry")
    if InvoiceKind(draft.invoice_kind) != InvoiceKind.DELIVERY_COMMISSION:
        raise CorrectionNotFoundError(
            "journal entry is not a delivery commission invoice"
        )
    return draft


def _release_posted_draft(draft: InvoiceDraft | None):
    """Hand back an `after_gl` hook that unposts the draft behind an entry.

    A voided invoice must not leave its draft reading `posted`. That status is
    what every screen goes by, so a stale one means the invoice still shows as
    booked, still offers Edit and Void, and still blocks the same file being
    uploaded again — while its money is no longer in the ledger. Pressing Void
    a second time then does nothing at all: the entry is already voided, so
    the actions endpoint returns no void path and the button quietly gives up.

    `confirmed` rather than `draft`: the invoice was read and approved, it is
    only the posting that was undone. It lands in Ready to post, which is
    where it can be posted again or discarded.

    Shared because supplier invoices, credit notes and delivery commissions
    all carry a draft, and the first version of this only did commissions —
    so voiding a supplier invoice left exactly the mess described above.
    """

    def release(sess: Session, _original: JournalEntry, _reversal: JournalEntry) -> None:
        if draft is None:
            return
        draft.status = InvoiceDraftStatus.CONFIRMED.value
        draft.posted_at = None
        draft.posted_by = None
        draft.journal_entry_id = None
        sess.flush()

    return release


def _draft_for_journal_entry(
    session: Session, journal_entry_id: uuid.UUID
) -> InvoiceDraft | None:
    """The draft behind a posted entry, if it came from one.

    None is ordinary: an invoice posted by hand has no uploaded document.
    """
    return session.scalar(
        select(InvoiceDraft).where(InvoiceDraft.journal_entry_id == journal_entry_id)
    )


def void_delivery_commission_invoice(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    """Take a posted delivery commission back out of the books."""
    with entity_context(session, entity_id):
        require_entity_context()
        draft = _delivery_commission_draft(session, journal_entry_id)

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        after_gl=_release_posted_draft(draft),
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
    period_unlock_reason: str | None = None,
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
        period_unlock_reason=period_unlock_reason,
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
    extra_days: int | None = None,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
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
        # Extra-days rows carry a day count; keep it (or take the corrected one)
        # so an edited entry doesn't lose "4 days × 950" on the way through.
        new_extra_days = extra_days if extra_days is not None else staff_row.extra_days

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
                period_year=staff_row.period_year,
                period_month=staff_row.period_month,
                extra_days=new_extra_days,
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
        period_unlock_reason=period_unlock_reason,
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
    period_unlock_reason: str | None = None,
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
        period_unlock_reason=period_unlock_reason,
        partner_row=partner_row,
        new_partner_row=new_row,
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
    period_unlock_reason: str | None = None,
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
        period_unlock_reason=period_unlock_reason,
        fx_row=fx_row,
        new_fx_row=new_fx,
    )


class PosDailySummaryCorrectionError(ValueError):
    """Posted POS daily summary cannot be corrected."""


@dataclass(frozen=True, slots=True)
class SubledgerVoidResult:
    original: JournalEntry
    reversal: JournalEntry


def _run_subledger_void(
    session: Session,
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None,
    void_date: date | None,
    period_unlock_reason: str | None = None,
    after_gl: Callable[[Session, JournalEntry, JournalEntry], None] | None = None,
) -> SubledgerVoidResult:
    from app.core.ledger.models import journal_void_update_allowed
    from app.core.period_locks.guards import mark_periods_dirty_for_dates

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        with journal_void_update_allowed(session):
            original, reversal = _void_journal_entry_in_transaction(
                session,
                entity_id,
                entry_id,
                actor_id=actor_id,
                reason=reason,
                void_date=void_date,
                period_unlock_reason=period_unlock_reason,
            )
            if after_gl is not None:
                after_gl(session, original, reversal)
            mark_periods_dirty_for_dates(
                session,
                entity_id,
                [original.entry_date, reversal.entry_date],
            )
            session.flush()
        session.commit()
        session.refresh(original)
        session.refresh(reversal)
        return SubledgerVoidResult(original=original, reversal=reversal)


def void_gl_with_subledger_rows(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
    supplier_row: SupplierLedgerEntry | None = None,
    customer_row: CustomerLedgerEntry | None = None,
    fx_row: FxLedgerEntry | None = None,
    staff_row: StaffLedgerEntry | None = None,
    partner_row: PartnerLedgerEntry | None = None,
    after_gl: Callable[[Session, JournalEntry, JournalEntry], None] | None = None,
) -> SubledgerVoidResult:
    def combined_after_gl(
        sess: Session,
        _original: JournalEntry,
        reversal: JournalEntry,
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
            _append_fx_reversal(
                sess, fx_row, reversal, actor_id=actor_id, void_date=void_date
            )
        if staff_row is not None:
            _append_staff_reversal(
                sess, staff_row, reversal, actor_id=actor_id, void_date=void_date
            )
        if partner_row is not None:
            _append_partner_reversal(
                sess, partner_row, reversal, actor_id=actor_id, void_date=void_date
            )
        if after_gl is not None:
            after_gl(sess, _original, reversal)

    return _run_subledger_void(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        after_gl=combined_after_gl,
    )


def void_expense_entry(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
    )


def void_staff_journal_entry(
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
        staff_rows = list(
            session.scalars(
                select(StaffLedgerEntry).where(
                    StaffLedgerEntry.journal_entry_id == journal_entry_id
                )
            )
        )
        if not staff_rows:
            raise CorrectionNotFoundError("staff ledger entry not found for journal entry")
        fx_row = session.scalar(
            select(FxLedgerEntry).where(FxLedgerEntry.journal_entry_id == journal_entry_id)
        )

    def reverse_all_staff_rows(
        sess: Session,
        _original: JournalEntry,
        reversal: JournalEntry,
    ) -> None:
        for staff_row in staff_rows:
            _append_staff_reversal(
                sess, staff_row, reversal, actor_id=actor_id, void_date=void_date
            )

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        fx_row=fx_row,
        after_gl=reverse_all_staff_rows,
    )


def void_partner_journal_entry(
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
        partner_row = session.scalar(
            select(PartnerLedgerEntry).where(
                PartnerLedgerEntry.journal_entry_id == journal_entry_id
            )
        )
        if partner_row is None:
            raise CorrectionNotFoundError("partner ledger entry not found for journal entry")
        # Partner paid supplier (split buy) also clears AP — reverse both ledgers.
        supplier_row = session.scalar(
            select(SupplierLedgerEntry).where(
                SupplierLedgerEntry.journal_entry_id == journal_entry_id
            )
        )

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        partner_row=partner_row,
        supplier_row=supplier_row,
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


def void_customer_payment(
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
        original_row = _get_customer_ledger_row(session, journal_entry_id)
        if original_row.movement_type != CustomerMovementType.PAYMENT_RECEIVED:
            raise CorrectionNotFoundError("journal entry is not a customer payment")

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        customer_row=original_row,
    )


def correct_customer_write_off(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    write_off_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerCorrectionResult:
    """Change a write-off's amount, date or wording.

    Void and re-post in one transaction, like every other correction here —
    the ledger row is immutable, so "editing" a write-off means replacing it.

    The forex leg is recomputed rather than copied. It is worked out *after*
    the reversal is appended, so the balance it apportions against is the one
    that existed before the original write-off: correcting 88,00 ₺ to 44,00 ₺
    should release half the currency, not half of what is left afterwards.
    """
    from app.core.chart_of_accounts.default_chart import (
        ACCOUNTS_RECEIVABLE_CODE,
        SALES_DISCOUNT_CODE,
    )
    from app.core.receivables.posting import _customer_outstanding_forex

    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        original_row = _get_customer_ledger_row(session, journal_entry_id)
        if original_row.movement_type != CustomerMovementType.DISCOUNT:
            raise CorrectionNotFoundError("journal entry is not a receivable write-off")

    def after_gl(
        sess: Session,
        _original: JournalEntry,
        reversal: JournalEntry,
        corrected: JournalEntry,
    ) -> None:
        row = _get_customer_ledger_row(sess, journal_entry_id)
        customer_id = row.customer_id

        # Reversal first: it puts the original write-off back on the balance,
        # which is what the new amount has to be measured against.
        _append_customer_reversal(
            sess, row, reversal, actor_id=actor_id, void_date=void_date
        )

        current = int(
            sess.scalar(
                select(func.coalesce(func.sum(CustomerLedgerEntry.amount_kurus), 0)).where(
                    CustomerLedgerEntry.customer_id == customer_id
                )
            )
            or 0
        )
        if amount_kurus > current:
            raise receivables_ledger.OverpaymentError(
                f"write-off {amount_kurus} exceeds receivable balance {current}"
            )

        currency, native_bal = _customer_outstanding_forex(sess, customer_id)
        native_written: int | None = None
        if currency and native_bal > 0 and current > 0:
            native_written = round(native_bal * amount_kurus / current)

        receivables_ledger.persist_customer_ledger_entry(
            sess,
            customer_id,
            movement_date=write_off_date,
            movement_type=CustomerMovementType.DISCOUNT,
            amount_kurus=-amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=corrected.id,
            forex_currency=currency,
            # Negative, so it reduces what is owed rather than adding to it.
            total_forex_minor=(-native_written if native_written else None),
        )

    def build_lines(sess: Session) -> list[PostingLine]:
        ar_account = sess.scalar(
            select(Account).where(Account.code == ACCOUNTS_RECEIVABLE_CODE)
        )
        discount_account = sess.scalar(
            select(Account).where(Account.code == SALES_DISCOUNT_CODE)
        )
        if ar_account is None or discount_account is None:
            raise InvalidAccountError("write-off accounts not found")
        return [
            PostingLine(
                account_id=discount_account.id,
                amount_kurus=amount_kurus,
                side=AccountNormalBalance.DEBIT,
            ),
            PostingLine(
                account_id=ar_account.id,
                amount_kurus=amount_kurus,
                side=AccountNormalBalance.CREDIT,
            ),
        ]

    return _run_subledger_correction_with_setup(
        session,
        entity_id,
        journal_entry_id,
        write_off_date,
        description,
        build_lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        after_gl=after_gl,
    )


def void_customer_write_off(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    """Undo a receivable write-off.

    Every other row on a customer ledger could be voided; this one could not,
    so a write-off entered by mistake was permanent. It is also the only way
    to repair a write-off posted before `native_balance_for_currency` was
    fixed: those recorded no forex amount, because the balance they consulted
    came back negative and the native leg was skipped. The row itself is
    immutable — correctly — so the remedy is to void and re-post, which now
    writes the native leg it should have written the first time.
    """
    with entity_context(session, entity_id):
        require_entity_context()
        original_row = _get_customer_ledger_row(session, journal_entry_id)
        if original_row.movement_type != CustomerMovementType.DISCOUNT:
            raise CorrectionNotFoundError("journal entry is not a receivable write-off")

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        customer_row=original_row,
    )


def void_credit_sale(
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
        original_row = _get_customer_ledger_row(session, journal_entry_id)
        if original_row.movement_type != CustomerMovementType.CREDIT_SALE:
            raise CorrectionNotFoundError("journal entry is not a credit sale")

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        customer_row=original_row,
    )


def void_fx_purchase(
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
        original_row = _get_fx_ledger_row(session, journal_entry_id)
        if original_row.movement_type != FxMovementType.PURCHASE:
            raise CorrectionNotFoundError("journal entry is not an FX purchase")

    def after_cash(
        sess: Session,
        _original: JournalEntry,
        reversal: JournalEntry,
    ) -> None:
        original_cash = _get_cash_movement_for_journal(sess, journal_entry_id)
        if original_cash is not None:
            _append_cash_movement_reversal(
                sess,
                entity_id,
                original_cash,
                reversal,
                actor_id=actor_id,
                void_date=void_date,
                period_unlock_reason=period_unlock_reason,
            )

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        fx_row=original_row,
        after_gl=after_cash,
    )


def void_fx_conversion_or_spend(
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
        original_row = _get_fx_ledger_row(session, journal_entry_id)
        if original_row.movement_type not in (
            FxMovementType.CONVERSION,
            FxMovementType.EXPENSE_SPEND,
        ):
            raise CorrectionNotFoundError("journal entry is not FX conversion or spend")

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        fx_row=original_row,
    )


def _void_journal_entry_in_transaction(
    session: Session,
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> tuple[JournalEntry, JournalEntry]:
    from app.core.ledger.posting import _create_reversal_entry, _mark_original_voided
    from app.core.period_locks.guards import assert_entry_dates_allowed, utc_today

    original = _get_voidable_entry(session, entry_id)
    effective_void_date = void_date or utc_today()
    assert_entry_dates_allowed(
        session,
        entity_id,
        [original.entry_date, effective_void_date],
        actor_id=actor_id,
        unlock_reason=period_unlock_reason,
    )
    reversal = _create_reversal_entry(
        session,
        entity_id,
        original,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
    )
    _mark_original_voided(session, original, reversal, actor_id=actor_id, reason=reason)
    return original, reversal


def correct_pos_daily_summary(
    session: Session,
    entity_id: uuid.UUID,
    summary: "PosDailySummary",
    *,
    money_account_id: uuid.UUID,
    cash_kurus: int,
    card_kurus: int,
    summary_date: date,
    actor_id: uuid.UUID,
    description: str,
    z_report_kurus: int | None = None,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> "PosDailySummaryPostResult":
    """Void linked card batch + cash movement JEs and repost corrected daily sales."""
    from app.core.period_locks.guards import assert_entry_dates_allowed, mark_periods_dirty_for_dates
    from app.core.pos.daily_summary_posting import (
        PosDailySummaryPostError,
        PosDailySummaryPostResult,
        confirm_pos_daily_summary,
    )
    from app.features.pos.models import CardSalesBatch, PosDailySummaryStatus

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    status = PosDailySummaryStatus(summary.status)
    if status != PosDailySummaryStatus.POSTED:
        raise PosDailySummaryCorrectionError(
            f"summary status {status.value!r} cannot be corrected — must be posted"
        )

    if cash_kurus < 0 or card_kurus < 0:
        raise PosDailySummaryPostError("cash and card amounts must be >= 0")
    if cash_kurus == 0 and card_kurus == 0:
        raise PosDailySummaryPostError("at least one of cash or card must be positive")

    total_kurus = cash_kurus + card_kurus
    dirty_dates: list[date] = []

    with entity_context(session, entity_id):
        require_entity_context()

        from app.core.ledger.models import journal_void_update_allowed

        with journal_void_update_allowed(session):
            if summary.card_sales_batch_id is not None:
                batch = session.get(CardSalesBatch, summary.card_sales_batch_id)
                if batch is not None:
                    _, card_reversal = _void_journal_entry_in_transaction(
                        session,
                        entity_id,
                        batch.journal_entry_id,
                        actor_id=actor_id,
                        reason=reason,
                        void_date=void_date,
                        period_unlock_reason=period_unlock_reason,
                    )
                    dirty_dates.extend([batch.sales_date, card_reversal.entry_date])

            if summary.cash_movement_id is not None:
                original_cash = session.get(CashMovement, summary.cash_movement_id)
                if original_cash is not None:
                    _, cash_reversal = _void_journal_entry_in_transaction(
                        session,
                        entity_id,
                        original_cash.journal_entry_id,
                        actor_id=actor_id,
                        reason=reason,
                        void_date=void_date,
                        period_unlock_reason=period_unlock_reason,
                    )
                    _append_cash_movement_reversal(
                        session,
                        entity_id,
                        original_cash,
                        cash_reversal,
                        actor_id=actor_id,
                        void_date=void_date,
                        period_unlock_reason=period_unlock_reason,
                    )
                    dirty_dates.extend(
                        [original_cash.movement_date, cash_reversal.entry_date]
                    )

            summary.summary_date = summary_date
            summary.cash_kurus = cash_kurus
            summary.card_kurus = card_kurus
            summary.total_kurus = total_kurus
            summary.money_account_id = money_account_id
            if z_report_kurus is not None:
                summary.z_report_kurus = z_report_kurus
            summary.status = PosDailySummaryStatus.CONFIRMED
            summary.card_sales_batch_id = None
            summary.cash_movement_id = None
            session.flush()

        assert_entry_dates_allowed(
            session,
            entity_id,
            [summary_date],
            actor_id=actor_id,
            unlock_reason=period_unlock_reason,
        )

        result = confirm_pos_daily_summary(
            session,
            entity_id,
            summary,
            money_account_id=money_account_id,
            cash_kurus=cash_kurus,
            card_kurus=card_kurus,
            actor_id=actor_id,
            description=description,
            z_report_kurus=z_report_kurus,
            period_unlock_reason=period_unlock_reason,
        )

        if dirty_dates:
            mark_periods_dirty_for_dates(session, entity_id, dirty_dates)

        return result


def void_pos_daily_summary(
    session: Session,
    entity_id: uuid.UUID,
    summary: "PosDailySummary",
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    """Void a posted daily summary — reverse linked card batch + cash movement JEs.

    Same void half as ``correct_pos_daily_summary`` but without a repost; the
    summary row is marked voided, freeing its date for a fresh posting.
    F3 policy (2026-07-10): identical retroactive behavior to all other voids,
    gated by period locks.
    """
    from app.core.period_locks.guards import mark_periods_dirty_for_dates
    from app.features.pos.models import CardSalesBatch, PosDailySummaryStatus

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    status = PosDailySummaryStatus(summary.status)
    if status != PosDailySummaryStatus.POSTED:
        raise PosDailySummaryCorrectionError(
            f"summary status {status.value!r} cannot be voided — must be posted"
        )

    dirty_dates: list[date] = []
    original: JournalEntry | None = None
    reversal: JournalEntry | None = None

    with entity_context(session, entity_id):
        require_entity_context()

        from app.core.ledger.models import journal_void_update_allowed

        with journal_void_update_allowed(session):
            if summary.card_sales_batch_id is not None:
                batch = session.get(CardSalesBatch, summary.card_sales_batch_id)
                if batch is not None:
                    original, reversal = _void_journal_entry_in_transaction(
                        session,
                        entity_id,
                        batch.journal_entry_id,
                        actor_id=actor_id,
                        reason=reason,
                        void_date=void_date,
                        period_unlock_reason=period_unlock_reason,
                    )
                    dirty_dates.extend([batch.sales_date, reversal.entry_date])

            if summary.cash_movement_id is not None:
                original_cash = session.get(CashMovement, summary.cash_movement_id)
                if original_cash is not None:
                    cash_original, cash_reversal = _void_journal_entry_in_transaction(
                        session,
                        entity_id,
                        original_cash.journal_entry_id,
                        actor_id=actor_id,
                        reason=reason,
                        void_date=void_date,
                        period_unlock_reason=period_unlock_reason,
                    )
                    _append_cash_movement_reversal(
                        session,
                        entity_id,
                        original_cash,
                        cash_reversal,
                        actor_id=actor_id,
                        void_date=void_date,
                    )
                    dirty_dates.extend(
                        [original_cash.movement_date, cash_reversal.entry_date]
                    )
                    if original is None:
                        original, reversal = cash_original, cash_reversal

            if original is None or reversal is None:
                raise PosDailySummaryCorrectionError(
                    "summary has no linked journal entries to void"
                )

            summary.status = PosDailySummaryStatus.VOIDED
            # Retire the fingerprint so the same POS photo can be re-uploaded
            # after the void — the (entity_id, file_fingerprint) unique
            # constraint would otherwise block it forever.
            summary.file_fingerprint = f"voided:{summary.id}"
            if dirty_dates:
                mark_periods_dirty_for_dates(session, entity_id, dirty_dates)
            session.flush()
        session.commit()
        session.refresh(original)
        session.refresh(reversal)
        return SubledgerVoidResult(original=original, reversal=reversal)
