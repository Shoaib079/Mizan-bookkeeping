"""Excel/PDF export for a single staff ledger.

Only the staff-specific parts live here — the headline figures and the
movement wording. The statement is built by `reports.subledger_export`, shared
with partners, customers and suppliers.
"""

from __future__ import annotations

from app.core.excel.labels import format_staff_movement
from app.features.reports.subledger_export import (
    SubledgerExport,
    SubledgerRow,
    build_subledger_pdf,
    build_subledger_xlsx,
    effective_entries,
    row_status,
)
from app.features.staff.schema import StaffLedgerRead


def _export(
    entity_name: str, employee_name: str, ledger: StaffLedgerRead
) -> SubledgerExport:
    return SubledgerExport(
        entity_name=entity_name,
        subject_name=employee_name,
        ledger_label="Staff ledger",
        sheet_name="Staff",
        # The three questions anyone opens a staff ledger to answer: what is
        # owed overall, how much salary has accrued but not been paid, and how
        # much advance is still outstanding against it.
        summary=[
            ("Balance", ledger.balance_minor),
            ("Unpaid salary", ledger.remaining_accrual_minor),
            ("Outstanding advance", ledger.outstanding_advance_minor),
        ],
        rows=[
            SubledgerRow(
                movement_date=entry.movement_date,
                movement=format_staff_movement(entry.movement_type),
                description=entry.description,
                amount_minor=entry.amount_minor,
                # The staff ledger carries no running balance — the column is
                # left empty rather than a total being invented here.
                running_minor=None,
                status=row_status(entry),
            )
            for entry in effective_entries(ledger.entries)
        ],
    )


def build_staff_ledger_xlsx(
    *,
    entity_name: str,
    employee_name: str,
    ledger: StaffLedgerRead,
) -> bytes:
    return build_subledger_xlsx(_export(entity_name, employee_name, ledger))


def build_staff_ledger_pdf(
    *,
    entity_name: str,
    employee_name: str,
    ledger: StaffLedgerRead,
) -> bytes:
    return build_subledger_pdf(_export(entity_name, employee_name, ledger))
