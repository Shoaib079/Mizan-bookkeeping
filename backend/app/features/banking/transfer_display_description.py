"""Display + write composers for account-transfer descriptions."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.banking.models import MoneyAccount
from app.features.banking.schema import AccountTransferRead
from app.features.banking.transfer_models import AccountTransfer

BARE_NOTE_DEFAULTS = frozenset({"account transfer"})


def format_transfer_account_label(name: str, account_kind: str | object) -> str:
    """Match transfer-form picker labels: ``Main Drawer (cash)``."""
    kind = (
        account_kind.value
        if hasattr(account_kind, "value")
        else str(account_kind)
    )
    return f"{name} ({kind})"


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
    # Prior composed Transfer · … is not an owner note.
    if text.startswith("Transfer · ") and " — " not in text:
        return None
    if " — " in text and text.startswith("Transfer · "):
        rest = text.split(" — ", 1)[1].strip()
        return rest or None
    if not _is_bare_note(text):
        return text
    return None


def build_transfer_display_description(
    *,
    from_label: str,
    to_label: str,
    note: str | None,
) -> str:
    body = f"Transfer · {from_label} → {to_label}"
    return append_owner_note(body, note)


def compose_transfer_post_description(
    *,
    from_name: str,
    from_kind: str | object,
    to_name: str,
    to_kind: str | object,
    raw_note: str | None = None,
) -> str:
    return build_transfer_display_description(
        from_label=format_transfer_account_label(from_name, from_kind),
        to_label=format_transfer_account_label(to_name, to_kind),
        note=note_from_payload(raw_note),
    )


def apply_transfer_descriptions(
    session: Session,
    transfers: Sequence[AccountTransfer],
    reads: Sequence[AccountTransferRead],
) -> None:
    """Overwrite transfer read-model descriptions (display-only)."""
    if not transfers or not reads:
        return
    account_ids = {
        tid
        for row in transfers
        for tid in (row.from_money_account_id, row.to_money_account_id)
    }
    accounts = {
        ma.id: ma
        for ma in session.scalars(select(MoneyAccount).where(MoneyAccount.id.in_(account_ids)))
    }
    transfer_by_id = {row.id: row for row in transfers}
    for read in reads:
        row = transfer_by_id.get(read.id)
        if row is None:
            continue
        from_acc = accounts.get(row.from_money_account_id)
        to_acc = accounts.get(row.to_money_account_id)
        if from_acc is None or to_acc is None:
            continue
        body = build_transfer_display_description(
            from_label=format_transfer_account_label(from_acc.name, from_acc.account_kind),
            to_label=format_transfer_account_label(to_acc.name, to_acc.account_kind),
            note=None,
        )
        note = owner_note_from_stored(row.description, body)
        read.description = append_owner_note(body, note)
