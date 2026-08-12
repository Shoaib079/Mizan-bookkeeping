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
            # Still "Net balance" — the name was always right, the figure was
            # not. It used to exclude profit already credited to the partner,
            # which meant announcing a debt of 80.800 on the same sheet that
            # owed them 68.763,91. Renaming it would have churned the
            # vocabulary of every reader to describe a corrected number.
            ("Net balance", ledger.current_account_kurus),
            ("— of which unpaid profit", ledger.unpaid_profit_kurus),
            ("Fronted expenses", ledger.balance_kurus),
            # Capital is not part of the balance above and must not be read as
            # one: money put into the business is not a debt it repays on
            # demand.
            ("Capital contributed (separate)", ledger.capital_contribution_kurus),
            ("Profit allocated", ledger.profit_allocated_kurus),
            # The middle term. Without it, allocated 100.000 next to unpaid 0
            # leaves the reader to work out where the rest went.
            ("Settled from drawings", ledger.profit_settled_kurus),
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
