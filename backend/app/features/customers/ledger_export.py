"""Excel/PDF export for a single customer ledger.

Only the customer-specific parts live here. The statement is built by
`reports.subledger_export`, shared with partners, staff and suppliers.
"""

from __future__ import annotations

from app.core.excel.labels import format_customer_movement
from app.features.customers.schema import CustomerLedgerRead
from app.features.reports.subledger_export import (
    SubledgerExport,
    SubledgerRow,
    build_subledger_pdf,
    build_subledger_xlsx,
    effective_entries,
    row_status,
)


def _export(
    entity_name: str, customer_name: str, ledger: CustomerLedgerRead
) -> SubledgerExport:
    # The lira balance is the ledger's truth and heads the statement. A
    # customer billed in a foreign currency also gets a line per currency,
    # because that is the sum they agreed to hand over — the lira equivalent
    # moves with the rate until they do.
    #
    # The minor amounts are formatted as lira by the shared builder, which is
    # wrong for a USD figure, so the currency goes in the label instead of
    # being silently mis-symbolled: "Owed in USD" reads correctly whatever the
    # number formatting does.
    summary: list[tuple[str, int]] = [("Balance", ledger.balance_kurus)]
    for row in ledger.outstanding_by_currency:
        label = "Owed in" if row.minor >= 0 else "Paid ahead in"
        summary.append((f"{label} {row.currency}", abs(row.minor)))

    return SubledgerExport(
        entity_name=entity_name,
        subject_name=customer_name,
        ledger_label="Customer ledger",
        sheet_name="Customer",
        summary=summary,
        rows=[
            SubledgerRow(
                movement_date=entry.movement_date,
                movement=format_customer_movement(entry.movement_type),
                description=entry.description,
                amount_minor=entry.amount_kurus,
                running_minor=None,
                status=row_status(entry),
            )
            for entry in effective_entries(ledger.entries)
        ],
    )


def build_customer_ledger_xlsx(
    *,
    entity_name: str,
    customer_name: str,
    ledger: CustomerLedgerRead,
) -> bytes:
    return build_subledger_xlsx(_export(entity_name, customer_name, ledger))


def build_customer_ledger_pdf(
    *,
    entity_name: str,
    customer_name: str,
    ledger: CustomerLedgerRead,
) -> bytes:
    return build_subledger_pdf(_export(entity_name, customer_name, ledger))
