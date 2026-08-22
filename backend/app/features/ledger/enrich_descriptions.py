"""Enrich GL journal entry list descriptions from linked subledgers."""

from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.fx.models import FxLedgerEntry
from app.core.ledger.models import JournalEntrySource
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.row_subjects import attach_subject_names
from app.core.staff.models import StaffLedgerEntry
from app.features.fx.ledger_display_description import apply_fx_ledger_descriptions
from app.features.fx.schema import FxLedgerEntryRead
from app.features.ledger.schema import JournalEntryOut
from app.features.partners.ledger_display_description import (
    apply_partner_ledger_descriptions,
)
from app.features.partners.schema import PartnerLedgerEntryRead
from app.features.staff.ledger_display_description import (
    apply_staff_ledger_descriptions,
    pick_primary_staff_row,
)
from app.features.staff.schema import StaffLedgerEntryRead

_STAFF_SOURCES = frozenset(
    {
        JournalEntrySource.STAFF_ACCRUAL,
        JournalEntrySource.STAFF_ADVANCE,
        JournalEntrySource.STAFF_PAYMENT,
    }
)
_FX_SOURCES = frozenset(
    {
        JournalEntrySource.FX_PURCHASE,
        JournalEntrySource.FX_CONVERSION,
        JournalEntrySource.FX_EXPENSE_SPEND,
    }
)
_PARTNER_SOURCES = frozenset(
    {
        JournalEntrySource.PARTNER_EXPENSE_FRONTED,
        JournalEntrySource.PARTNER_SALARY_FRONTED,
        JournalEntrySource.PARTNER_REIMBURSEMENT_PAID,
        JournalEntrySource.PARTNER_DRAWING,
        JournalEntrySource.PARTNER_DRAWING_REPAYMENT,
        JournalEntrySource.PARTNER_CAPITAL_CONTRIBUTION,
        JournalEntrySource.PARTNER_LOAN_RECEIVED,
        JournalEntrySource.PARTNER_LOAN_REPAID,
        JournalEntrySource.PARTNER_PROFIT_ALLOCATION,
        JournalEntrySource.PARTNER_PROFIT_PAID,
        JournalEntrySource.PARTNER_SUPPLIER_PAID,
    }
)


def enrich_journal_entry_descriptions(
    session: Session, outs: list[JournalEntryOut]
) -> None:
    """Set JournalEntryOut.description from composed subledger text when linked."""
    if not outs:
        return
    je_ids = [out.id for out in outs]
    out_by_id = {out.id: out for out in outs}
    entity_id = outs[0].entity_id

    staff_rows = list(
        session.scalars(
            select(StaffLedgerEntry).where(StaffLedgerEntry.journal_entry_id.in_(je_ids))
        )
    )
    fx_rows = list(
        session.scalars(
            select(FxLedgerEntry).where(FxLedgerEntry.journal_entry_id.in_(je_ids))
        )
    )
    partner_rows = list(
        session.scalars(
            select(PartnerLedgerEntry).where(
                PartnerLedgerEntry.journal_entry_id.in_(je_ids)
            )
        )
    )

    staff_by_je: dict[uuid.UUID, list[StaffLedgerEntry]] = defaultdict(list)
    for row in staff_rows:
        if row.journal_entry_id is not None:
            staff_by_je[row.journal_entry_id].append(row)

    primary_staff: list[StaffLedgerEntry] = []
    staff_reads: list[StaffLedgerEntryRead] = []
    for je_id, rows in staff_by_je.items():
        out = out_by_id.get(je_id)
        if out is None or out.source not in _STAFF_SOURCES:
            continue
        primary = pick_primary_staff_row(rows)
        if primary is None:
            continue
        primary_staff.append(primary)
        staff_reads.append(StaffLedgerEntryRead.model_validate(primary))
    if primary_staff:
        apply_staff_ledger_descriptions(session, primary_staff, staff_reads)
        for entry, read in zip(primary_staff, staff_reads, strict=True):
            out = out_by_id.get(entry.journal_entry_id)  # type: ignore[arg-type]
            if out is not None:
                out.description = read.description

    fx_by_je = {row.journal_entry_id: row for row in fx_rows if row.journal_entry_id}
    fx_entries: list[FxLedgerEntry] = []
    fx_reads: list[FxLedgerEntryRead] = []
    for je_id, row in fx_by_je.items():
        out = out_by_id.get(je_id)
        if out is None or out.source not in _FX_SOURCES:
            continue
        fx_entries.append(row)
        fx_reads.append(FxLedgerEntryRead.model_validate(row))
    if fx_entries:
        apply_fx_ledger_descriptions(
            session, fx_entries, fx_reads, entity_id=entity_id
        )
        for entry, read in zip(fx_entries, fx_reads, strict=True):
            out = out_by_id.get(entry.journal_entry_id)  # type: ignore[arg-type]
            if out is not None:
                out.description = read.description

    partner_by_je: dict[uuid.UUID, list[PartnerLedgerEntry]] = defaultdict(list)
    for row in partner_rows:
        if row.journal_entry_id is not None:
            partner_by_je[row.journal_entry_id].append(row)

    partner_entries: list[PartnerLedgerEntry] = []
    partner_reads: list[PartnerLedgerEntryRead] = []
    for je_id, rows in partner_by_je.items():
        out = out_by_id.get(je_id)
        if out is None or out.source not in _PARTNER_SOURCES:
            continue
        row = rows[0]
        partner_entries.append(row)
        partner_reads.append(PartnerLedgerEntryRead.model_validate(row))
    if partner_entries:
        attach_subject_names(session, partner_entries, partner_reads)
        apply_partner_ledger_descriptions(session, partner_entries, partner_reads)
        for entry, read in zip(partner_entries, partner_reads, strict=True):
            out = out_by_id.get(entry.journal_entry_id)  # type: ignore[arg-type]
            if out is not None:
                out.description = read.description
