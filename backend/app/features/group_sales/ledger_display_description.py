"""Display-only group-sale descriptions for the customer ledger."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.money import format_minor_units
from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables.types import CustomerMovementType
from app.features.customers.schema import CustomerLedgerEntryRead
from app.features.group_sales.models import GroupSale, GroupSaleLine
from app.features.group_sales.schema import GROUP_SALE_REFERENCE

_DEFAULT_NOTE = "group sale"


def _format_line(line: GroupSaleLine, currency: str) -> str:
    rate = format_minor_units(line.rate_per_person_minor, currency)
    return f"{line.menu_name_snapshot} · {line.pax} pax × {rate}"


def _owner_note(group_sale: GroupSale) -> str | None:
    note = group_sale.description.strip()
    if not note or note.casefold() == _DEFAULT_NOTE:
        return None
    return note


def _line_sort_key(line: GroupSaleLine) -> tuple[str, int, int, str]:
    return (
        line.menu_name_snapshot.casefold(),
        line.pax,
        line.rate_per_person_minor,
        str(line.id),
    )


def build_group_sale_ledger_display_description(
    group_sale: GroupSale,
    lines: Sequence[GroupSaleLine],
) -> str:
    """Rich ledger label from stored menu lines — never writes the subledger row."""
    ordered = sorted(lines, key=_line_sort_key)
    if not ordered:
        return "Group sale"
    body = " + ".join(_format_line(line, group_sale.currency) for line in ordered)
    note = _owner_note(group_sale)
    if note:
        return f"{body} — {note}"
    return body


def apply_group_sale_ledger_descriptions(
    session: Session,
    entries: list[CustomerLedgerEntry],
    reads: list[CustomerLedgerEntryRead],
) -> None:
    """Replace description on group-sale credit rows for screen and export."""
    sale_ids = {
        entry.reference_id
        for entry in entries
        if entry.movement_type == CustomerMovementType.CREDIT_SALE
        and entry.reference_type == GROUP_SALE_REFERENCE
        and entry.reference_id is not None
    }
    if not sale_ids:
        return

    sales = session.scalars(
        select(GroupSale)
        .options(selectinload(GroupSale.lines))
        .where(GroupSale.id.in_(sale_ids))
    ).all()
    by_sale_id = {
        sale.id: build_group_sale_ledger_display_description(sale, sale.lines)
        for sale in sales
    }

    entry_by_id = {entry.id: entry for entry in entries}
    for read in reads:
        entry = entry_by_id.get(read.id)
        if entry is None or entry.reference_id is None:
            continue
        display = by_sale_id.get(entry.reference_id)
        if display is not None:
            read.description = display
