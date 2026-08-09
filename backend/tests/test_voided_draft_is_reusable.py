"""Voiding an invoice must leave its file usable again — for every kind.

Two fixes written the same evening collided here. `_release_posted_draft`
hands a voided invoice's draft back to `confirmed` so it stops showing as
posted. `_posting_was_voided` decides whether the same file may be uploaded
again. The first cleared `journal_entry_id`; the second read it. Each was
right alone. Together they made a voided invoice permanently un-re-uploadable
— the exact complaint the pair was written to fix.

Nothing connected them, so nothing objected. This file is that connection,
and it is written to hold for invoice kinds that do not exist yet: the scan
is over the void routes as a class, not the two that happen to exist today.
"""

from __future__ import annotations

import ast
import pathlib
import uuid

import pytest

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")

BACKEND = pathlib.Path(__file__).resolve().parents[1]
CORRECTION = BACKEND / "app" / "core" / "ledger" / "correction.py"

RELEASE_HOOK = "_release_posted_draft"


def _void_routes_touching_drafts() -> list[tuple[str, set[str]]]:
    """Void routes that deal with an invoice draft, and what they call.

    "Deals with a draft" is matched on any name containing `draft`, not on a
    list of known helpers. The first version of this looked for `InvoiceDraft`
    or `_draft_for_journal_entry` and found one route out of two, because the
    commission route gets its draft from `_delivery_commission_draft` — a
    helper the list did not know about. A scan that has to be told every name
    in advance goes blind the moment someone adds one, which is the failure
    this whole file is about.

    Parsed rather than grepped so the answer is per function body.
    """
    tree = ast.parse(CORRECTION.read_text())
    routes: list[tuple[str, set[str]]] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if not node.name.startswith("void_"):
            continue
        names = {
            sub.id for sub in ast.walk(node) if isinstance(sub, ast.Name)
        } | {
            sub.attr for sub in ast.walk(node) if isinstance(sub, ast.Attribute)
        }
        if any("draft" in name.lower() for name in names):
            routes.append((node.name, names))
    return routes


def test_the_scan_finds_the_void_routes_it_is_meant_to_police():
    """Guard the guard — a scan over an empty list proves nothing."""
    routes = _void_routes_touching_drafts()
    assert len(routes) >= 2, (
        f"expected the draft-carrying void routes, found {[r[0] for r in routes]}"
    )


def test_every_void_route_with_a_draft_releases_it():
    """The rule, stated once, for kinds that do not exist yet.

    A fourth invoice kind added next month gets a void route. If it forgets
    the release hook, its drafts sit reading `posted` after the money has
    left the books — Review keeps showing them, Void does nothing the second
    time, and the file cannot be uploaded again. That was the bug, three
    times, for three different kinds.
    """
    missing = [
        name
        for name, names in _void_routes_touching_drafts()
        if RELEASE_HOOK not in names
    ]
    assert missing == [], (
        "these void an invoice without releasing its draft:\n  "
        + "\n  ".join(missing)
        + f"\n\nPass `after_gl={RELEASE_HOOK}(draft)` so the draft stops "
        "reading `posted` once its entry is out of the books."
    )


# --- the coupling that actually broke ------------------------------------


def test_a_released_draft_still_says_it_was_posted(db_session, restaurant_a):
    """The invariant the two fixes have to agree on.

    `_release_posted_draft` decides what a released draft looks like.
    `_posting_was_voided` reads that shape. This pins them together, so
    changing either one alone fails here rather than in production three
    weeks later.
    """
    from datetime import date

    from sqlalchemy import select

    from app.core.chart_of_accounts.default_chart import (
        ACCOUNTS_PAYABLE_CODE,
        GENERAL_EXPENSE_CODE,
    )
    from app.core.chart_of_accounts.models import Account
    from app.core.chart_of_accounts.seed import seed_default_chart
    from app.core.chart_of_accounts.types import AccountNormalBalance
    from app.core.ledger.correction import _release_posted_draft
    from app.core.ledger.models import JournalEntrySource
    from app.core.ledger.posting import (
        PostingLine,
        prepare_journal_entry,
        void_journal_entry,
    )
    from app.db.session import entity_context
    from app.features.invoices.models import (
        InvoiceDraft,
        InvoiceDraftStatus,
        InvoiceSourceType,
    )
    from app.features.invoices.service import _posting_was_voided

    entity_id = restaurant_a.id
    seed_default_chart(db_session, entity_id)

    # A real entry, because the draft's link is a foreign key — it cannot be
    # pointed at an invented id, which is worth knowing: the link can never
    # dangle, so "was posted" is a fact the row can be trusted to hold.
    with entity_context(db_session, entity_id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        entry = prepare_journal_entry(
            db_session,
            entity_id,
            date(2026, 7, 31),
            "Invoice that will be voided",
            [
                PostingLine(
                    account_id=accounts[GENERAL_EXPENSE_CODE],
                    amount_kurus=120_000,
                    side=AccountNormalBalance.DEBIT,
                ),
                PostingLine(
                    account_id=accounts[ACCOUNTS_PAYABLE_CODE],
                    amount_kurus=120_000,
                    side=AccountNormalBalance.CREDIT,
                ),
            ],
            actor_id=ACTOR_ID,
            source=JournalEntrySource.INVOICE,
        )
        db_session.flush()
        entry_id = entry.id

        draft = InvoiceDraft(
            status=InvoiceDraftStatus.POSTED.value,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint="a" * 64,
            invoice_number="REUSE-1",
            invoice_date=date(2026, 7, 31),
            net_kurus=100_000,
            gross_kurus=120_000,
            vat_breakdown=[
                {"rate_percent": 20, "base_kurus": 100_000, "vat_kurus": 20_000}
            ],
            currency="TRY",
            extraction_payload={},
            journal_entry_id=entry_id,
        )
        db_session.add(draft)
        db_session.commit()
        draft_id = draft.id

    # While it stands, the file is not re-uploadable — the other half of the
    # claim, without which this passes for a function that returns True always.
    with entity_context(db_session, entity_id):
        draft = db_session.get(InvoiceDraft, draft_id)
        assert _posting_was_voided(db_session, entity_id, draft) is False

    void_journal_entry(
        db_session, entity_id, entry_id, actor_id=ACTOR_ID, reason="duplicate"
    )

    with entity_context(db_session, entity_id):
        draft = db_session.get(InvoiceDraft, draft_id)
        _release_posted_draft(draft)(db_session, None, None)

        assert draft.status == InvoiceDraftStatus.CONFIRMED.value, (
            "a released draft must stop reading posted — that is the point"
        )
        assert _posting_was_voided(db_session, entity_id, draft) is True, (
            "the release left nothing for the same-file check to recognise, so "
            "the file it belongs to can never be uploaded again"
        )


def test_a_draft_that_was_never_posted_is_not_mistaken_for_a_voided_one(
    db_session, restaurant_a
):
    """The other half. Without this the check above passes for a function
    that returns True unconditionally."""
    from datetime import date

    from app.features.invoices.models import (
        InvoiceDraft,
        InvoiceDraftStatus,
        InvoiceSourceType,
    )
    from app.features.invoices.service import _posting_was_voided
    from app.db.session import entity_context

    with entity_context(db_session, restaurant_a.id):
        draft = InvoiceDraft(
            status=InvoiceDraftStatus.CONFIRMED.value,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint="b" * 64,
            invoice_number="REUSE-2",
            invoice_date=date(2026, 7, 31),
            net_kurus=100_000,
            gross_kurus=120_000,
            vat_breakdown=[
                {"rate_percent": 20, "base_kurus": 100_000, "vat_kurus": 20_000}
            ],
            currency="TRY",
            extraction_payload={},
            journal_entry_id=None,
        )
        db_session.add(draft)
        db_session.flush()

        assert _posting_was_voided(db_session, restaurant_a.id, draft) is False, (
            "never posted — re-uploading it should still say it is waiting in Review"
        )
