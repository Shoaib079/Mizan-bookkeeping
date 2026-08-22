"""Display + write composers for partner ledger descriptions."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.partners.models import PartnerLedgerEntry
from app.features.partners.models import Partner
from app.features.partners.schema import PartnerLedgerEntryRead

# Match frontend `partnerMovementLabels` in subledger-labels.ts
PARTNER_MOVEMENT_LABELS: dict[str, str] = {
    "opening_balance": "Opening balance",
    "expense_fronted": "Partner paid expense",
    "salary_fronted": "Salary paid for staff",
    "reimbursement_paid": "Reimbursement paid",
    "drawing": "Drawing",
    "drawing_repayment": "Drawing repayment",
    "capital_contribution": "Capital contribution",
    "partner_loan_received": "Partner loan received",
    "partner_loan_repaid": "Partner loan repaid",
    "profit_allocation": "Profit allocation — added to capital",
    "profit_settlement": "Profit allocation — cleared earlier drawings",
    "profit_paid": "Profit paid",
}

BARE_NOTE_DEFAULTS = frozenset(
    {
        "partner cash payment",
        "partner profit paid",
        "partner returned cash",
        "partner profit allocation",
        "salary payment",
        "manual expense",
        "opening balances",
        "opening balance",
    }
)


def _is_bare_note(text: str) -> bool:
    return text.casefold().strip() in BARE_NOTE_DEFAULTS


def note_from_payload(raw: str | None) -> str | None:
    text = (raw or "").strip()
    if not text or _is_bare_note(text):
        return None
    return text


def append_owner_note(body: str, note: str | None) -> str:
    if note:
        return f"{body} — {note}"
    return body


def owner_note_from_stored(stored: str | None, body: str) -> str | None:
    text = (stored or "").strip()
    if not text or _is_bare_note(text) or text == body:
        return None
    prefix = f"{body} — "
    if text.startswith(prefix):
        rest = text[len(prefix) :].strip()
        return rest or None
    if text.startswith("Settled from profit — "):
        rest = text[len("Settled from profit — ") :].strip()
        return rest or None
    # Prior composed identity (`Label · Partner`…) is not an owner note.
    if " · " in text and " — " not in text:
        return None
    if " — " in text:
        rest = text.split(" — ", 1)[1].strip()
        return rest or None
    if not _is_bare_note(text):
        return text
    return None


def movement_label(movement_type: str) -> str:
    return PARTNER_MOVEMENT_LABELS.get(movement_type, movement_type.replace("_", " "))


def build_partner_ledger_display_description(
    *,
    movement_type: str,
    partner_name: str,
    subject_name: str | None,
    note: str | None,
) -> str:
    label = movement_label(movement_type)
    subject = (subject_name or "").strip() or None
    if subject:
        body = f"{label} · {partner_name} · {subject}"
    else:
        body = f"{label} · {partner_name}"
    return append_owner_note(body, note)


def compose_partner_post_description(
    *,
    movement_type: str,
    partner_name: str,
    subject_name: str | None = None,
    raw_note: str | None = None,
) -> str:
    return build_partner_ledger_display_description(
        movement_type=movement_type,
        partner_name=partner_name,
        subject_name=subject_name,
        note=note_from_payload(raw_note),
    )


def compose_pay_partner_pair(
    partner_name: str, raw_note: str | None
) -> tuple[str, str]:
    """Reimbursement + drawing descriptions for a single cash payout action."""
    return (
        compose_partner_post_description(
            movement_type="reimbursement_paid",
            partner_name=partner_name,
            raw_note=raw_note,
        ),
        compose_partner_post_description(
            movement_type="drawing",
            partner_name=partner_name,
            raw_note=raw_note,
        ),
    )


def apply_partner_ledger_descriptions(
    session: Session,
    entries: Sequence[PartnerLedgerEntry],
    reads: Sequence[PartnerLedgerEntryRead],
) -> None:
    """Overwrite partner read descriptions; clear subject_name to avoid UI doubling."""
    if not entries or not reads:
        return
    partner_ids = {entry.partner_id for entry in entries}
    names = {
        row.id: row.name
        for row in session.scalars(select(Partner).where(Partner.id.in_(partner_ids)))
    }
    entry_by_id = {entry.id: entry for entry in entries}
    for read in reads:
        entry = entry_by_id.get(read.id)
        if entry is None:
            continue
        partner_name = names.get(entry.partner_id, "Partner")
        movement = (
            entry.movement_type.value
            if hasattr(entry.movement_type, "value")
            else str(entry.movement_type)
        )
        subject = getattr(read, "subject_name", None)
        body = build_partner_ledger_display_description(
            movement_type=movement,
            partner_name=partner_name,
            subject_name=subject,
            note=None,
        )
        note = owner_note_from_stored(entry.description, body)
        # Subject stays on the read model for API/tests; UI/export use description only
        # (no second " · subject" append) so names are not doubled.
        read.description = append_owner_note(body, note)
