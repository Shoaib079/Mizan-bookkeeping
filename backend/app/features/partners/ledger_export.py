"""Excel/PDF export for a single partner ledger.

Only the partner-specific parts live here: which figures head the statement,
and what a partner movement type is called. The statement itself is built by
`reports.subledger_export`, shared with staff, customers and suppliers.
"""

from __future__ import annotations

from app.core.excel.labels import format_partner_movement
from app.features.partners.schema import PartnerLedgerRead
from app.features.reports.subledger_export import (
    SubledgerExport,
    SubledgerRow,
    build_subledger_pdf,
    build_subledger_xlsx,
    effective_entries,
    row_status,
)


def _export(entity_name: str, partner_name: str, ledger: PartnerLedgerRead) -> SubledgerExport:
    return SubledgerExport(
        entity_name=entity_name,
        subject_name=partner_name,
        ledger_label="Partner ledger",
        sheet_name="Partner",
        summary=[
            ("Net balance", ledger.net_balance_kurus),
            ("Fronted expenses", ledger.balance_kurus),
            ("Capital contributed", ledger.capital_contribution_kurus),
            ("Profit allocated", ledger.profit_allocated_kurus),
            # The middle term. Without it, allocated 100.000 next to unpaid 0
            # leaves the reader to work out where the rest went.
            ("Settled from drawings", ledger.profit_settled_kurus),
            ("Unpaid profit", ledger.unpaid_profit_kurus),
            ("Partner loan", ledger.loan_balance_kurus),
        ],
        rows=[
            SubledgerRow(
                movement_date=entry.movement_date,
                movement=format_partner_movement(entry.movement_type),
                description=entry.description,
                amount_minor=entry.amount_kurus,
                running_minor=entry.running_balance_kurus,
                status=row_status(entry),
            )
            for entry in effective_entries(ledger.entries)
        ],
    )


def build_partner_ledger_xlsx(
    *,
    entity_name: str,
    partner_name: str,
    ledger: PartnerLedgerRead,
) -> bytes:
    return build_subledger_xlsx(_export(entity_name, partner_name, ledger))


def build_partner_ledger_pdf(
    *,
    entity_name: str,
    partner_name: str,
    ledger: PartnerLedgerRead,
) -> bytes:
    return build_subledger_pdf(_export(entity_name, partner_name, ledger))
