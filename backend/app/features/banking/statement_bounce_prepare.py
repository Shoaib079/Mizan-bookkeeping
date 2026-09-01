"""Prepare statement lines for payment bounce — any starting state."""

from __future__ import annotations

import uuid
from datetime import date
from enum import Enum

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ledger.correction.partners import void_partner_journal_entry
from app.core.ledger.correction.staff import void_staff_journal_entry
from app.core.ledger.correction.suppliers import void_supplier_payment
from app.core.ledger.models import JournalEntry, JournalEntryStatus
from app.core.ledger.posting import void_journal_entry
from app.core.partners.models import PartnerLedgerEntry
from app.core.payables.models import SupplierLedgerEntry
from app.core.staff.models import StaffLedgerEntry
from app.features.banking.statement_models import (
    BankStatementLine,
    BouncePersonType,
    StatementLineStatus,
)

AUTO_VOID_LINE_MSG = (
    "This line has an active ledger entry. "
    "Confirm auto-void to void it and record the bounce."
)
AUTO_VOID_ORPHAN_PAYMENT_MSG = (
    "A posted payment still exists for this person and amount. "
    "Confirm auto-void to void it and record the bounce."
)

_BOUNCEABLE_STATUSES = frozenset(
    {
        StatementLineStatus.IMPORTED,
        StatementLineStatus.NEEDS_REVIEW,
        StatementLineStatus.CLASSIFIED,
        StatementLineStatus.POSTED,
        StatementLineStatus.LINKED,
    }
)


class BounceLineState(str, Enum):
    ALREADY_BOUNCED = "already_bounced"
    UNPOSTED = "unposted"
    CLASSIFIED_NO_JOURNAL = "classified_no_journal"
    VOIDED_JOURNAL = "voided_journal"
    ACTIVE_JOURNAL = "active_journal"
    LINKED = "linked"
    ORPHANED_JOURNAL = "orphaned_journal"
    UNKNOWN = "unknown"


class BouncePairError(ValueError):
    """Invalid bounce pair request."""


def analyze_line_state(session: Session, line: BankStatementLine) -> BounceLineState:
    if line.bounce_pair_id is not None:
        return BounceLineState.ALREADY_BOUNCED

    if line.journal_entry_id is None:
        if line.status in (
            StatementLineStatus.IMPORTED,
            StatementLineStatus.NEEDS_REVIEW,
        ):
            return BounceLineState.UNPOSTED
        if line.status == StatementLineStatus.CLASSIFIED:
            return BounceLineState.CLASSIFIED_NO_JOURNAL
        if line.status == StatementLineStatus.LINKED:
            return BounceLineState.LINKED
        return BounceLineState.UNKNOWN

    journal = session.get(JournalEntry, line.journal_entry_id)
    if journal is None:
        return BounceLineState.ORPHANED_JOURNAL

    if journal.status == JournalEntryStatus.VOIDED:
        return BounceLineState.VOIDED_JOURNAL

    if journal.status == JournalEntryStatus.POSTED:
        if line.status == StatementLineStatus.LINKED:
            return BounceLineState.LINKED
        return BounceLineState.ACTIVE_JOURNAL

    return BounceLineState.UNKNOWN


def clear_line_settlement_refs(line: BankStatementLine) -> None:
    line.journal_entry_id = None
    line.supplier_ledger_entry_id = None
    line.account_transfer_id = None
    line.pos_settlement_id = None
    line.delivery_settlement_id = None
    line.credit_card_payment_id = None
    line.customer_ledger_entry_id = None
    line.expense_entry_id = None
    line.candidate_supplier_ledger_entry_id = None
    line.candidate_account_transfer_id = None


def _void_journal_for_bounce(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    person_type: BouncePersonType | None,
    actor_id: uuid.UUID,
    reason: str,
    void_date: date,
) -> None:
    journal = session.get(JournalEntry, journal_entry_id)
    if journal is None or journal.status == JournalEntryStatus.VOIDED:
        return

    supplier_row = session.scalar(
        select(SupplierLedgerEntry).where(
            SupplierLedgerEntry.journal_entry_id == journal_entry_id
        )
    )
    if supplier_row is not None:
        void_supplier_payment(
            session,
            entity_id,
            journal_entry_id,
            actor_id=actor_id,
            reason=reason,
            void_date=void_date,
        )
        return

    staff_row = session.scalar(
        select(StaffLedgerEntry).where(
            StaffLedgerEntry.journal_entry_id == journal_entry_id
        )
    )
    if staff_row is not None:
        void_staff_journal_entry(
            session,
            entity_id,
            journal_entry_id,
            actor_id=actor_id,
            reason=reason,
            void_date=void_date,
        )
        return

    partner_row = session.scalar(
        select(PartnerLedgerEntry).where(
            PartnerLedgerEntry.journal_entry_id == journal_entry_id
        )
    )
    if partner_row is not None:
        void_partner_journal_entry(
            session,
            entity_id,
            journal_entry_id,
            actor_id=actor_id,
            reason=reason,
            void_date=void_date,
        )
        return

    void_journal_entry(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
    )


def void_orphan_person_payment(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    person_type: BouncePersonType,
    actor_id: uuid.UUID,
    reason: str,
    void_date: date,
) -> None:
    _void_journal_for_bounce(
        session,
        entity_id,
        journal_entry_id,
        person_type=person_type,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
    )


def prepare_line_for_bounce(
    session: Session,
    entity_id: uuid.UUID,
    line: BankStatementLine,
    *,
    label: str,
    auto_void_confirmed: bool,
    actor_id: uuid.UUID,
    reason: str | None,
    person_type: BouncePersonType | None = None,
) -> uuid.UUID | None:
    """Clear stale refs or void active journals so the line can be bounced."""
    if line.bounce_pair_id is not None:
        raise BouncePairError(f"{label} is already part of a bounce pair")

    if line.status not in _BOUNCEABLE_STATUSES:
        raise BouncePairError(f"{label} is in an invalid state: {line.status.value}")

    state = analyze_line_state(session, line)
    if state == BounceLineState.ALREADY_BOUNCED:
        raise BouncePairError(f"{label} is already part of a bounce pair")

    if state in (
        BounceLineState.UNPOSTED,
        BounceLineState.CLASSIFIED_NO_JOURNAL,
    ):
        return None

    if state in (BounceLineState.VOIDED_JOURNAL, BounceLineState.ORPHANED_JOURNAL):
        clear_line_settlement_refs(line)
        return None

    if state in (BounceLineState.ACTIVE_JOURNAL, BounceLineState.LINKED):
        if not auto_void_confirmed:
            raise BouncePairError(AUTO_VOID_LINE_MSG)
        assert line.journal_entry_id is not None
        voided_id = line.journal_entry_id
        void_reason = reason or "Payment bounce"
        _void_journal_for_bounce(
            session,
            entity_id,
            line.journal_entry_id,
            person_type=person_type,
            actor_id=actor_id,
            reason=f"Auto-voided for bounce: {void_reason}",
            void_date=line.transaction_date,
        )
        session.refresh(line)
        return voided_id

    raise BouncePairError(f"{label} is in an unsupported state for bounce")
