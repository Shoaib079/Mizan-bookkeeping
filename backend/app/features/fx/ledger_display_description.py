"""Display + write composers for FX ledger descriptions."""

from __future__ import annotations

from app.core.money import format_try

_BARE_PREFIXES = ("buy ", "convert ", "fx expense (", "fx purchase")


def _is_bare_note(text: str) -> bool:
    folded = text.casefold().strip()
    if not folded:
        return True
    return any(folded.startswith(prefix) for prefix in _BARE_PREFIXES)


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
    if not _is_bare_note(text):
        return text
    return None


def format_native_amount(native_quantity: int, currency: str) -> str:
    whole, frac = divmod(abs(int(native_quantity)), 100)
    return f"{whole}.{frac:02d} {currency}"


def _try_embed(amount_kurus: int) -> str:
    return format_try(amount_kurus).removesuffix(" ₺")


def format_purchase_rate(try_cost_kurus: int, native_quantity: int) -> str:
    if native_quantity > 0:
        rate_kurus_per_major = try_cost_kurus * 100 // native_quantity
        return _try_embed(rate_kurus_per_major)
    return _try_embed(try_cost_kurus)


def build_fx_purchase_description(
    *,
    native_quantity: int,
    currency: str,
    try_cost_kurus: int,
    cash_account_name: str,
    note: str | None,
) -> str:
    native = format_native_amount(native_quantity, currency)
    rate = format_purchase_rate(try_cost_kurus, native_quantity)
    body = f"FX purchase · {native} @ {rate} ₺ · from {cash_account_name}"
    return append_owner_note(body, note)


def build_fx_conversion_description(
    *,
    native_quantity: int,
    currency: str,
    try_received_kurus: int,
    note: str | None,
) -> str:
    native = format_native_amount(native_quantity, currency)
    received = _try_embed(try_received_kurus)
    body = f"FX conversion · {native} → {received} ₺"
    return append_owner_note(body, note)


def build_fx_spend_description(
    *,
    native_quantity: int,
    currency: str,
    expense_description: str | None,
    note: str | None,
) -> str:
    native = format_native_amount(native_quantity, currency)
    expense = (expense_description or "").strip() or None
    if expense and _is_bare_note(expense):
        expense = None
    if expense:
        body = f"FX spend · {native} · {expense}"
    else:
        body = f"FX spend · {native}"
    return append_owner_note(body, note)


# Re-export apply so callers keep importing from this module.
from app.features.fx.ledger_display_apply import apply_fx_ledger_descriptions  # noqa: E402

__all__ = [
    "append_owner_note",
    "apply_fx_ledger_descriptions",
    "build_fx_conversion_description",
    "build_fx_purchase_description",
    "build_fx_spend_description",
    "format_native_amount",
    "format_purchase_rate",
    "note_from_payload",
    "owner_note_from_stored",
]
