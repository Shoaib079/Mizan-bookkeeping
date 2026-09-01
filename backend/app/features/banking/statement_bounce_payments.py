"""Active person-payment lookup for payment bounce pairs."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntry, JournalEntryStatus
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.types import StaffMovementType
from app.features.banking.statement_models import BouncePersonType

_STAFF_OUTFLOW_TYPES = frozenset(
    {
        StaffMovementType.SALARY_PAYMENT,
        StaffMovementType.ADVANCE_PAID,
        StaffMovementType.INCENTIVE_PAID,
    }
)

_PARTNER_OUTFLOW_TYPES = frozenset(
    {
        PartnerMovementType.REIMBURSEMENT_PAID,
        PartnerMovementType.DRAWING,
        PartnerMovementType.PROFIT_PAID,
        PartnerMovementType.PARTNER_LOAN_REPAID,
    }
)


def find_active_payment_journal(
    session: Session,
    *,
    person_type: BouncePersonType,
    person_id: uuid.UUID,
    amount_kurus: int,
    payment_date: date,
    exclude_journal_ids: set[uuid.UUID],
) -> uuid.UUID | None:
    if person_type == BouncePersonType.SUPPLIER:
        row = session.scalar(
            select(SupplierLedgerEntry)
            .join(JournalEntry, SupplierLedgerEntry.journal_entry_id == JournalEntry.id)
            .where(
                JournalEntry.status == JournalEntryStatus.POSTED,
                SupplierLedgerEntry.supplier_id == person_id,
                SupplierLedgerEntry.movement_type == SupplierMovementType.PAYMENT,
                SupplierLedgerEntry.movement_date == payment_date,
                SupplierLedgerEntry.amount_kurus == -amount_kurus,
            )
            .limit(1)
        )
    elif person_type == BouncePersonType.STAFF:
        row = session.scalar(
            select(StaffLedgerEntry)
            .join(JournalEntry, StaffLedgerEntry.journal_entry_id == JournalEntry.id)
            .where(
                JournalEntry.status == JournalEntryStatus.POSTED,
                StaffLedgerEntry.employee_id == person_id,
                StaffLedgerEntry.movement_type.in_(_STAFF_OUTFLOW_TYPES),
                StaffLedgerEntry.movement_date == payment_date,
                StaffLedgerEntry.amount_minor == -amount_kurus,
            )
            .limit(1)
        )
    else:
        row = session.scalar(
            select(PartnerLedgerEntry)
            .join(JournalEntry, PartnerLedgerEntry.journal_entry_id == JournalEntry.id)
            .where(
                JournalEntry.status == JournalEntryStatus.POSTED,
                PartnerLedgerEntry.partner_id == person_id,
                PartnerLedgerEntry.movement_type.in_(_PARTNER_OUTFLOW_TYPES),
                PartnerLedgerEntry.movement_date == payment_date,
                PartnerLedgerEntry.amount_kurus == -amount_kurus,
            )
            .limit(1)
        )
    if row is None:
        return None
    journal_id = row.journal_entry_id
    if journal_id in exclude_journal_ids:
        return None
    return journal_id
