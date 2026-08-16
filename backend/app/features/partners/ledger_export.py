"""Excel/PDF export for a single partner ledger.

Only the partner-specific parts live here: which figures head the statement,
and what a partner movement type is called. The statement itself is built by
`reports.subledger_export`, shared with staff, customers and suppliers.
"""

from __future__ import annotations

from app.core.excel.labels import format_partner_movement
from app.core.partners.types import (
    PROFIT_ALLOCATED_MOVEMENT_TYPES,
    PartnerMovementType,
)
from app.features.partners.schema import PartnerLedgerRead
from app.features.reports.subledger_export import (
    SubledgerExport,
    SubledgerRow,
    build_subledger_pdf,
    build_subledger_xlsx,
    effective_entries,
    row_status,
)


#: English, to match the heading the partner page already prints.
_MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)

#: Inside an allocation the generic labels do not explain the split. Same
#: words the page uses in `allocationRowLabel`.
_ALLOCATION_PART = {
    PartnerMovementType.PROFIT_SETTLEMENT: "— cleared earlier drawings",
    PartnerMovementType.PROFIT_ALLOCATION: "— added to capital",
}


def _rows(entries: list) -> list[SubledgerRow]:
    """Movements, with each profit allocation headed by its own total.

    The engine never writes the share as a row: it splits it into the part
    that cleared open drawings and the smaller part credited to the partner.
    The owner reads those two and asks where their 75.000 went — the figure
    they were told they had earned appears nowhere, because it was 6.236,09
    plus 68.763,91 on two lines under two labels.

    So each allocation gets a heading carrying the gross, and the rows beneath
    read as its breakdown. The headings sum to "Profit allocated" in the
    summary; the rows beneath each sum to their heading. The partner page has
    grouped them this way since it was built — this is the export catching up.
    """
    rows: list[SubledgerRow] = []
    index = 0
    while index < len(entries):
        entry = entries[index]
        if entry.movement_type not in PROFIT_ALLOCATED_MOVEMENT_TYPES:
            rows.append(
                SubledgerRow(
                    movement_date=entry.movement_date,
                    movement=format_partner_movement(entry.movement_type),
                    description=entry.description,
                    amount_minor=entry.amount_kurus,
                    running_minor=entry.running_balance_kurus,
                    status=row_status(entry),
                )
            )
            index += 1
            continue

        # One allocation: the consecutive run sharing this journal entry.
        group = []
        while (
            index < len(entries)
            and entries[index].movement_type in PROFIT_ALLOCATED_MOVEMENT_TYPES
            and entries[index].journal_entry_id == entry.journal_entry_id
        ):
            group.append(entries[index])
            index += 1

        month = _MONTHS[entry.movement_date.month - 1]
        rows.append(
            SubledgerRow(
                movement_date=entry.movement_date,
                movement=f"{month} {entry.movement_date.year} profit allocation",
                description="Share for the period",
                amount_minor=sum(part.amount_kurus for part in group),
                running_minor=None,
                status="",
            )
        )
        for part in group:
            rows.append(
                SubledgerRow(
                    movement_date=part.movement_date,
                    movement=_ALLOCATION_PART[part.movement_type],
                    description=part.description,
                    amount_minor=part.amount_kurus,
                    running_minor=part.running_balance_kurus,
                    status=row_status(part),
                )
            )
    return rows


def _summary(ledger: PartnerLedgerRead) -> list[tuple[str, int]]:
    """What is true of this partner, not the whole vocabulary.

    Seven lines before this, four of them zero for most partners — fronted
    expenses, partner loan, and the two halves of a profit split that had
    already settled. A statement that always prints every term it knows makes
    the reader find the two figures that moved.

    The balance is unconditional: zero is an answer, and "settled" is worth
    saying. Everything else earns its line by being non-zero.
    """
    lines: list[tuple[str, int]] = [
        # Profit included — what the partner is owed, or owes, today. Matches
        # the figure at the top of their page.
        ("Net balance", ledger.current_account_kurus),
    ]
    # Not part of the balance above and never added to it: money put into the
    # business is not a debt it repays on demand. Shown beside it, as the page
    # shows it beside the heading.
    if ledger.capital_balance_kurus:
        lines.append(("Capital in business", ledger.capital_balance_kurus))
    # The allocation headings in the rows below sum to this.
    if ledger.profit_allocated_kurus:
        lines.append(("Profit allocated", ledger.profit_allocated_kurus))
    if ledger.balance_kurus:
        lines.append(("Fronted expenses", ledger.balance_kurus))
    if ledger.loan_balance_kurus:
        lines.append(("Partner loan", ledger.loan_balance_kurus))
    return lines


def _export(entity_name: str, partner_name: str, ledger: PartnerLedgerRead) -> SubledgerExport:
    return SubledgerExport(
        entity_name=entity_name,
        subject_name=partner_name,
        ledger_label="Partner ledger",
        sheet_name="Partner",
        summary=_summary(ledger),
        rows=_rows(effective_entries(ledger.entries)),
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
