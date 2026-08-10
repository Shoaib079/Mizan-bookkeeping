"""The shared spine of every correction and void — no domain knowledge.

Lifted verbatim from `correction.py` when it was split. Every type-specific
flow — supplier, customer, FX, staff, partner, POS — reaches the ledger
through the two runners here, and each appends its subledger reversal with one
of the `_append_*` helpers.

Twenty-five of the flows call into this module. It calls back into none of
them, which is the property that keeps the package free of cycles: registry →
machinery → domains → package. Anything here that needed to know which domain
it was serving would be in the wrong file.

The `_get_*_ledger_row` lookups are each used by a single domain and could
have gone there. They stay because they are four-line
`select … where journal_entry_id == …` queries, and scattering them means the
next domain module written gets a fifth copy rather than finding the one that
exists — which is the mistake the whole split is meant to undo.
"""

from __future__ import annotations

from app.core.cash.guards import resolve_session_for_movement
from app.core.fx.models import FxLedgerEntry
from app.core.ledger.correction.registry import CorrectionNotFoundError
from app.core.ledger.models import JournalEntry
from app.core.ledger.posting import PostingLine, _correct_journal_entry_in_transaction, _get_voidable_entry
from app.core.partners.models import PartnerLedgerEntry
from app.core.payables.models import SupplierLedgerEntry
from app.core.receivables.models import CustomerLedgerEntry
from app.core.staff.models import StaffLedgerEntry
from app.db.session import entity_context, require_entity_context
from app.features.cash.models import CashMovement, CashMovementDirection
from app.features.entities import service as entity_service
from dataclasses import dataclass
from datetime import date
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import Callable
import uuid


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
    from app.core.ledger.posting import (
        _create_reversal_entry,
        _mark_original_voided,
        _retarget_statement_lines,
    )
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
    # The other void funnel. Both do this, because a rule kept in one of two
    # places is a rule that works half the time — and this is the half the
    # 41 registered correction sources go through.
    _retarget_statement_lines(session, entry_id)
    return original, reversal
