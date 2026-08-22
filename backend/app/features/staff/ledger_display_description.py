"""Display + write composers for staff ledger descriptions."""

from __future__ import annotations

import re
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.staff.models import StaffLedgerEntry
from app.features.staff.models import Employee
from app.features.staff.schema import StaffLedgerEntryRead

_OLD_AUTO_ACCRUAL = re.compile(r"^salary \d{4}-\d{2}$", re.IGNORECASE)

MONTH_ABBREV = (
    "",
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)

BARE_NOTE_DEFAULTS = frozenset(
    {
        "salary payment",
        "salary accrual",
        "salary advance",
        "advance returned",
    }
)

_COMPANION_SUFFIXES = (" — advance applied", " — excess as advance")
_PRIMARY_TYPES = frozenset(
    {"salary_accrued", "salary_payment", "advance_paid", "advance_returned"}
)


def period_label(year: int | None, month: int | None) -> str | None:
    if year is None or month is None or not 1 <= month <= 12:
        return None
    return f"{MONTH_ABBREV[month]} {year}"


def _is_bare_note(text: str) -> bool:
    return text.casefold() in BARE_NOTE_DEFAULTS


def append_owner_note(body: str, note: str | None) -> str:
    if note:
        return f"{body} — {note}"
    return body


def owner_note_from_stored(stored: str | None, body: str) -> str | None:
    text = (stored or "").strip()
    if not text or _is_bare_note(text) or text == body:
        return None
    if _OLD_AUTO_ACCRUAL.match(text):
        return None
    prefix = f"{body} — "
    if text.startswith(prefix):
        rest = text[len(prefix) :].strip()
        return rest or None
    if not _is_bare_note(text):
        return text
    return None


def note_from_payload(raw: str | None) -> str | None:
    text = (raw or "").strip()
    if not text or _is_bare_note(text):
        return None
    return text


def build_staff_ledger_display_description(
    *,
    movement_type: str,
    employee_name: str,
    period_year: int | None,
    period_month: int | None,
    note: str | None,
) -> str:
    period = period_label(period_year, period_month)
    if movement_type == "salary_accrued":
        body = f"Salary {period} · {employee_name}" if period else f"Salary · {employee_name}"
    elif movement_type == "salary_payment":
        body = f"Salary payment · {employee_name}"
        if period:
            body = f"{body} · {period}"
    elif movement_type == "advance_paid":
        body = f"Advance · {employee_name}"
    elif movement_type == "advance_returned":
        body = f"Advance returned · {employee_name}"
    else:
        body = f"{movement_type} · {employee_name}"
    return append_owner_note(body, note)


def compose_staff_post_description(
    *,
    movement_type: str,
    employee_name: str,
    period_year: int | None = None,
    period_month: int | None = None,
    raw_note: str | None = None,
) -> str:
    return build_staff_ledger_display_description(
        movement_type=movement_type,
        employee_name=employee_name,
        period_year=period_year,
        period_month=period_month,
        note=note_from_payload(raw_note),
    )


def apply_staff_ledger_descriptions(
    session: Session,
    entries: Sequence[StaffLedgerEntry],
    reads: Sequence[StaffLedgerEntryRead],
) -> None:
    """Overwrite read-model descriptions from structured facts (display-only)."""
    if not entries or not reads:
        return
    employee_ids = {entry.employee_id for entry in entries}
    names = {
        row.id: row.name
        for row in session.scalars(select(Employee).where(Employee.id.in_(employee_ids)))
    }
    entry_by_id = {entry.id: entry for entry in entries}
    for read in reads:
        entry = entry_by_id.get(read.id)
        if entry is None:
            continue
        stored = entry.description or ""
        if any(stored.endswith(suffix) for suffix in _COMPANION_SUFFIXES):
            continue
        name = names.get(entry.employee_id, "Employee")
        movement = (
            entry.movement_type.value
            if hasattr(entry.movement_type, "value")
            else str(entry.movement_type)
        )
        body = build_staff_ledger_display_description(
            movement_type=movement,
            employee_name=name,
            period_year=entry.period_year,
            period_month=entry.period_month,
            note=None,
        )
        note = owner_note_from_stored(stored, body)
        read.description = append_owner_note(body, note)


def pick_primary_staff_row(
    rows: Sequence[StaffLedgerEntry],
) -> StaffLedgerEntry | None:
    """Prefer payment/accrual/advance/return over companion advance_applied rows."""
    if not rows:
        return None
    for row in rows:
        mt = row.movement_type.value if hasattr(row.movement_type, "value") else str(row.movement_type)
        if mt in _PRIMARY_TYPES:
            return row
    return rows[0]
