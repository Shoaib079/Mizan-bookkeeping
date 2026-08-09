"""The same invoice never reaches the ledger twice — whatever kind it is.

Stated by the owner: *"i care about is if one invoice or receipt or delivery
invoice etc already exsist app does not re post it."*

There were two duplicate rules — supplier invoices and credit notes — branched
on by hand at four call sites. Delivery commissions appeared in none of them,
so a second copy of the same commission invoice posted without complaint as
long as the file bytes differed. A re-downloaded PDF differs.

The rules here are written over `InvoiceKind` as a set rather than over the
kinds that exist today, so the fourth one cannot arrive uncovered.
"""

from __future__ import annotations

import ast
import pathlib

import pytest

from app.features.invoices.invoice_uniqueness import (
    UnknownInvoiceKindError,
    _COUNTERPARTY_FIELD,
    counterparty_field_for,
)
from app.features.invoices.models import InvoiceDraft, InvoiceKind

BACKEND = pathlib.Path(__file__).resolve().parents[1]
GATE = "find_live_posted_duplicate_of"


def test_every_invoice_kind_has_a_duplicate_rule():
    """The whole point: a new kind fails here, not in the books.

    Enumerated from the enum rather than listed, so adding
    `InvoiceKind.SOMETHING` and nothing else turns this red immediately.
    """
    missing = [kind.value for kind in InvoiceKind if kind not in _COUNTERPARTY_FIELD]
    assert missing == [], (
        f"invoice kinds with no duplicate rule: {missing}\n"
        "Add each to _COUNTERPARTY_FIELD in invoice_uniqueness.py, naming the "
        "column that identifies who the invoice is from. Until then the same "
        "invoice of that kind can be posted as many times as it is uploaded."
    )


def test_the_named_column_actually_exists_on_the_draft():
    """A map is only as good as the names in it.

    `getattr(InvoiceDraft, field)` is what builds the query. A typo there
    would raise at query time — on the day someone posts that kind, not on
    the day the typo was written.
    """
    for kind, field in _COUNTERPARTY_FIELD.items():
        assert hasattr(InvoiceDraft, field), (
            f"{kind.value} names column {field!r}, which InvoiceDraft does not have"
        )


def test_an_unknown_kind_raises_rather_than_finding_nothing():
    """Silence is the failure mode being designed out.

    A chain of `if kind ==` returns None for a kind it does not know, which
    reads exactly like "no duplicate found". This has to be loud.
    """
    with pytest.raises(UnknownInvoiceKindError):
        counterparty_field_for("something_invented_later")


def _draft_posting_functions() -> list[tuple[str, bool]]:
    """Functions that post an invoice draft to the ledger, and whether gated."""
    found: list[tuple[str, bool]] = []
    for path in sorted((BACKEND / "app").rglob("*.py")):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            called = {
                sub.func.id
                for sub in ast.walk(node)
                if isinstance(sub, ast.Call) and isinstance(sub.func, ast.Name)
            }
            names = {
                sub.id for sub in ast.walk(node) if isinstance(sub, ast.Name)
            } | {
                sub.attr for sub in ast.walk(node) if isinstance(sub, ast.Attribute)
            }
            # Writes a journal entry, and does so from an invoice draft.
            if "prepare_journal_entry" in called and "InvoiceDraft" in names:
                found.append(
                    (f"{path.relative_to(BACKEND)}::{node.name}", GATE in called)
                )
    return found


def test_the_scan_finds_the_posting_paths():
    """Guard the guard — over an empty list the next test proves nothing."""
    paths = _draft_posting_functions()
    assert len(paths) >= 3, f"expected the draft posting paths, found {paths}"


def test_every_path_that_posts_a_draft_checks_for_a_duplicate_first():
    """Checked where the money is written, not only where the file arrives.

    Upload-time checks are worth having and are not sufficient: a draft can
    be created before its supplier is linked, or reach posting by a route
    that never went through intake. The ledger is the last place that can
    still say no, so the question gets asked there.
    """
    ungated = [name for name, gated in _draft_posting_functions() if not gated]
    assert ungated == [], (
        "these post an invoice draft without checking whether it is already "
        "in the books:\n  " + "\n  ".join(ungated)
        + f"\n\nCall {GATE}(session, entity_id, draft) before writing the entry."
    )
