"""Excel/PDF export for a single supplier ledger.

Only the supplier-specific parts live here. The statement is built by
`reports.subledger_export`, shared with partners, staff and customers.
"""

from __future__ import annotations

from app.core.excel.labels import format_supplier_movement
from app.features.payables.schema import SupplierLedgerRead
from app.features.reports.subledger_export import (
    SubledgerExport,
    SubledgerRow,
    build_subledger_pdf,
    build_subledger_xlsx,
    effective_entries,
    row_status,
)


def _export(
    entity_name: str, supplier_name: str, ledger: SupplierLedgerRead
) -> SubledgerExport:
    return SubledgerExport(
        entity_name=entity_name,
        subject_name=supplier_name,
        ledger_label="Supplier ledger",
        sheet_name="Supplier",
        summary=[("Owed to supplier", ledger.balance_kurus)],
        rows=[
            SubledgerRow(
                movement_date=entry.movement_date,
                movement=format_supplier_movement(entry.movement_type),
                description=entry.description,
                amount_minor=entry.amount_kurus,
                running_minor=None,
                status=row_status(entry),
            )
            for entry in effective_entries(ledger.entries)
        ],
    )


def build_supplier_ledger_xlsx(
    *,
    entity_name: str,
    supplier_name: str,
    ledger: SupplierLedgerRead,
) -> bytes:
    return build_subledger_xlsx(_export(entity_name, supplier_name, ledger))


def build_supplier_ledger_pdf(
    *,
    entity_name: str,
    supplier_name: str,
    ledger: SupplierLedgerRead,
) -> bytes:
    return build_subledger_pdf(_export(entity_name, supplier_name, ledger))
