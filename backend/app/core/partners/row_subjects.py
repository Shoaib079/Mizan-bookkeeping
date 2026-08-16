"""Who or what a partner ledger row points at, resolved by name.

A partner row already records its subject — `reference_type` plus
`reference_id` — and has since each of these was written. Nothing read them
back, so a partner who fronted three salaries in one week saw three rows
reading "Temmuz maaşı" and no way to tell whose.

The owner, of their own books: "if partner paid salary then which employee
salary show name".

Keyed on `reference_type` rather than on movement type, because the movement
type is the wrong question here: a personal expense split and cash the partner
took are both `drawing`, and only one of them points at anything. The
reference is what says whether there is a subject to name.

One query per reference type present, not one per row. A statement with fifty
fronted salaries costs a single lookup.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

#: Set by `post_partner_funded_salary`.
STAFF_EMPLOYEE_REFERENCE_TYPE = "staff_employee"

#: A resolver takes the ids seen on one page of rows and returns {id: name}.
#: Ids it cannot find are simply absent — a deleted subject leaves the row
#: reading exactly as it does today rather than failing the whole ledger.
Resolver = Callable[[Session, Sequence[uuid.UUID]], dict[uuid.UUID, str]]


def _employee_names(
    session: Session, ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, str]:
    from app.features.staff.models import Employee

    return {
        row_id: name
        for row_id, name in session.execute(
            select(Employee.id, Employee.name).where(Employee.id.in_(ids))
        )
    }


def _supplier_names_via_payment(
    session: Session, ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, str]:
    """The reference is the supplier *payment row*, so this joins to its supplier.

    Keyed by the payment row id, which is what the partner row stored — the
    caller must not have to know the reference is one hop from the name.
    """
    from app.core.payables.models import SupplierLedgerEntry
    from app.features.suppliers.models import Supplier

    return {
        row_id: name
        for row_id, name in session.execute(
            select(SupplierLedgerEntry.id, Supplier.name)
            .join(Supplier, Supplier.id == SupplierLedgerEntry.supplier_id)
            .where(SupplierLedgerEntry.id.in_(ids))
        )
    }


def _expense_names(
    session: Session, ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, str]:
    """What was bought, preferring what was actually written on the receipt."""
    from app.features.expenses.models import ExpenseEntry

    out: dict[uuid.UUID, str] = {}
    for row_id, written, description in session.execute(
        select(
            ExpenseEntry.id,
            ExpenseEntry.written_item_description,
            ExpenseEntry.description,
        ).where(ExpenseEntry.id.in_(ids))
    ):
        name = (written or "").strip() or (description or "").strip()
        if name:
            out[row_id] = name
    return out


#: Adding a reference type is one line here and nothing else. The page, the
#: PDF and the Excel all read `subject_name` and do not know what produced it.
RESOLVERS: dict[str, Resolver] = {
    STAFF_EMPLOYEE_REFERENCE_TYPE: _employee_names,
    "supplier_ledger_entry": _supplier_names_via_payment,
    "expense_entry": _expense_names,
}


def subject_names(session: Session, rows: Sequence[Any]) -> dict[uuid.UUID, str]:
    """{partner ledger row id: subject name} for the rows that have one.

    Rows with no reference, an unknown reference type, or a subject that has
    since gone are absent. Callers show the description alone for those, which
    is what every one of these rows does today.
    """
    by_type: dict[str, list[uuid.UUID]] = {}
    for row in rows:
        if row.reference_type in RESOLVERS and row.reference_id is not None:
            by_type.setdefault(row.reference_type, []).append(row.reference_id)

    names: dict[str, dict[uuid.UUID, str]] = {
        reference_type: RESOLVERS[reference_type](session, ids)
        for reference_type, ids in by_type.items()
    }

    return {
        row.id: names[row.reference_type][row.reference_id]
        for row in rows
        if row.reference_type in names
        and row.reference_id in names[row.reference_type]
    }


def attach_subject_names(session: Session, rows: Sequence[Any], reads: Sequence[Any]) -> None:
    """Fill `subject_name` on the read models built from `rows`.

    Matched on row id rather than by position, so it cannot quietly put one
    row's employee against another's if the two lists ever stop lining up.
    """
    names = subject_names(session, rows)
    for read in reads:
        if read.id in names:
            read.subject_name = names[read.id]
