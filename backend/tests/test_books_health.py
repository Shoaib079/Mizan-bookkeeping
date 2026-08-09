"""Each health check catches the fault it claims to (HARDENING_PLAN.md Phase 0).

A clean report is only worth something if a dirty one would have been dirty.
So every check here is proved twice: the books are checked clean, then broken
on purpose in exactly the way the check describes, and checked again.

Without the broken half these tests would pass against a check that returns
an empty list — which is the failure mode this whole plan exists to stop, and
one I produced three times in a single evening.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_PAYABLE_CODE,
    GENERAL_EXPENSE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.health.books_health import (
    CHECKS,
    check_assumed_vat_posted,
    check_drafts_claiming_posted,
    check_future_dated_entries,
    check_unbalanced_entries,
    run_books_health,
)
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.core.ledger.posting import PostingLine, prepare_journal_entry
from app.db.session import entity_context
from app.features.invoices.models import (
    InvoiceDraft,
    InvoiceDraftStatus,
    InvoiceSourceType,
)

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def books(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    return restaurant_a.id


def _accounts(db_session, entity_id) -> dict[str, uuid.UUID]:
    with entity_context(db_session, entity_id):
        return {a.code: a.id for a in db_session.scalars(select(Account))}


def _post_entry(db_session, entity_id, *, entry_date: date, amount: int = 10_000):
    accounts = _accounts(db_session, entity_id)
    with entity_context(db_session, entity_id):
        entry = prepare_journal_entry(
            db_session,
            entity_id,
            entry_date,
            "Health check fixture",
            [
                PostingLine(
                    account_id=accounts[GENERAL_EXPENSE_CODE],
                    amount_kurus=amount,
                    side=AccountNormalBalance.DEBIT,
                ),
                PostingLine(
                    account_id=accounts[ACCOUNTS_PAYABLE_CODE],
                    amount_kurus=amount,
                    side=AccountNormalBalance.CREDIT,
                ),
            ],
            actor_id=ACTOR_ID,
            source=JournalEntrySource.MANUAL,
        )
        db_session.commit()
        return entry.id


def _draft(db_session, entity_id, **fields) -> uuid.UUID:
    with entity_context(db_session, entity_id):
        draft = InvoiceDraft(
            status=fields.pop("status", InvoiceDraftStatus.POSTED.value),
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint=f"health-{uuid.uuid4().hex[:8]}",
            invoice_number=fields.pop("invoice_number", "HEALTH-1"),
            invoice_date=date(2026, 7, 31),
            net_kurus=100_000,
            gross_kurus=120_000,
            vat_breakdown=[
                {"rate_percent": 20, "base_kurus": 100_000, "vat_kurus": 20_000}
            ],
            currency="TRY",
            extraction_payload=fields.pop("extraction_payload", {}),
            confirmed_by=ACTOR_ID,
            **fields,
        )
        db_session.add(draft)
        db_session.commit()
        return draft.id


# --- the whole run -------------------------------------------------------


def test_a_freshly_seeded_entity_is_clean(db_session, books):
    """The baseline. If this is noisy nobody will read the report."""
    assert run_books_health(db_session, books) == []


def test_every_check_runs(db_session, books):
    """A check that raises is reported, not allowed to end the run — so a
    clean report must mean seven checks ran, not one that crashed early."""
    findings = run_books_health(db_session, books)
    assert not [f for f in findings if f.subject == "(the check itself)"]
    assert len(CHECKS) == 7


# --- 0.2 drafts claiming posted -----------------------------------------


def test_a_draft_posted_without_an_entry_is_found(db_session, books):
    _draft(db_session, books, invoice_number="NO-ENTRY-1")
    findings = check_drafts_claiming_posted(db_session, books)
    assert [f.check for f in findings] == ["draft_posted_without_entry"]
    assert "NO-ENTRY-1" in findings[0].subject


def test_a_draft_whose_entry_was_voided_is_found(db_session, books):
    """The reported bug: voided, and Review still shows it as posted."""
    entry_id = _post_entry(db_session, books, entry_date=date(2026, 7, 31))
    draft_id = _draft(db_session, books, invoice_number="VOIDED-1")
    with entity_context(db_session, books):
        db_session.get(InvoiceDraft, draft_id).journal_entry_id = entry_id
        db_session.commit()

    assert check_drafts_claiming_posted(db_session, books) == []

    from app.core.ledger.posting import void_journal_entry

    # It opens its own entity_context and commits — see conftest.py on why a
    # commit inside a context we also hold is the trap to avoid.
    void_journal_entry(db_session, books, entry_id, actor_id=ACTOR_ID, reason="test")

    findings = check_drafts_claiming_posted(db_session, books)
    assert [f.check for f in findings] == ["draft_posted_entry_voided"]
    assert "VOIDED-1" in findings[0].subject


# --- 0.4 future-dated entries -------------------------------------------


def test_a_future_dated_entry_is_found(db_session, books):
    """The 16.09.2026 invoice: right amount, wrong period, invisible."""
    today = date(2026, 8, 9)
    _post_entry(db_session, books, entry_date=today + timedelta(days=38))
    findings = check_future_dated_entries(db_session, books, today=today)
    assert [f.check for f in findings] == ["future_dated_entry"]
    assert "after today" in findings[0].detail


def test_todays_entry_is_not_flagged(db_session, books):
    """The boundary in the direction that matters — an invoice entered this
    morning is ordinary."""
    today = date(2026, 8, 9)
    _post_entry(db_session, books, entry_date=today)
    assert check_future_dated_entries(db_session, books, today=today) == []


# --- 0.5 unbalanced entries ---------------------------------------------


def test_an_unbalanced_entry_is_found(db_session, books):
    """Posting cannot produce this, so it is written directly — the check
    exists for whatever wrote to the ledger without going through posting."""
    entry_id = _post_entry(db_session, books, entry_date=date(2026, 7, 31))
    assert check_unbalanced_entries(db_session, books) == []

    with entity_context(db_session, books):
        line = db_session.scalar(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == entry_id,
                JournalEntryLine.side == AccountNormalBalance.CREDIT,
            )
        )
        line.amount_kurus += 1
        db_session.commit()

    findings = check_unbalanced_entries(db_session, books)
    assert [f.check for f in findings] == ["unbalanced_entry"]
    assert findings[0].severity == "critical"
    assert "out by -1" in findings[0].detail


# --- 0.6 assumed VAT ----------------------------------------------------


def test_a_posted_invoice_with_assumed_vat_is_found(db_session, books):
    """585,75 booked where the document said 185,83 — reaches a KDV return."""
    _draft(
        db_session,
        books,
        invoice_number="ASSUMED-1",
        extraction_payload={"raw": {"source": "pdf_heuristics", "assumed_vat": True}},
    )
    findings = check_assumed_vat_posted(db_session, books)
    assert [f.check for f in findings] == ["assumed_vat_posted"]
    assert "ASSUMED-1" in findings[0].subject


def test_an_invoice_whose_vat_was_read_is_not_flagged(db_session, books):
    _draft(
        db_session,
        books,
        invoice_number="READ-1",
        extraction_payload={"raw": {"source": "pdf_heuristics"}},
    )
    assert check_assumed_vat_posted(db_session, books) == []


# --- the report ---------------------------------------------------------


def test_findings_are_ordered_worst_first(db_session, books):
    """A long report has to lead with what matters or it will not be read."""
    entry_id = _post_entry(db_session, books, entry_date=date(2026, 7, 31))
    _draft(db_session, books, invoice_number="ORDER-1")
    _draft(
        db_session,
        books,
        invoice_number="ORDER-2",
        extraction_payload={"raw": {"assumed_vat": True}},
    )
    with entity_context(db_session, books):
        line = db_session.scalar(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == entry_id,
                JournalEntryLine.side == AccountNormalBalance.CREDIT,
            )
        )
        line.amount_kurus += 5
        db_session.commit()

    severities = [f.severity for f in run_books_health(db_session, books)]
    assert severities == sorted(
        severities, key=lambda s: ("critical", "high", "medium", "low").index(s)
    )
    assert severities[0] == "critical"


def test_the_checks_write_nothing(db_session, books):
    """The promise that makes this safe to point at production."""
    _post_entry(db_session, books, entry_date=date(2026, 7, 31))
    _draft(db_session, books, invoice_number="RO-1")

    with entity_context(db_session, books):
        before = (
            db_session.scalar(select(JournalEntry).where(JournalEntry.id.is_not(None)))
            is not None,
            len(list(db_session.scalars(select(InvoiceDraft.id)))),
            len(list(db_session.scalars(select(JournalEntryLine.id)))),
        )

    run_books_health(db_session, books)

    with entity_context(db_session, books):
        after = (
            db_session.scalar(select(JournalEntry).where(JournalEntry.id.is_not(None)))
            is not None,
            len(list(db_session.scalars(select(InvoiceDraft.id)))),
            len(list(db_session.scalars(select(JournalEntryLine.id)))),
        )
    assert before == after


def test_every_check_function_is_registered():
    """A check written and left out of CHECKS never runs.

    The same drift that has bitten this app all evening: a thing defined in
    one place and listed in another. Cheap to assert, so asserted.
    """
    import inspect

    from app.core.health import books_health

    defined = {
        name
        for name, obj in inspect.getmembers(books_health, inspect.isfunction)
        if name.startswith("check_") and obj.__module__ == books_health.__name__
    }
    registered = {fn.__name__ for fn in CHECKS}
    assert defined == registered, (
        f"defined but never run: {sorted(defined - registered)}; "
        f"registered but missing: {sorted(registered - defined)}"
    )


def test_the_cli_reports_without_touching_anything(db_session, books, capsys):
    """The report is the product. If it cannot be read it will not be run."""
    from app.core.health.cli import _format
    from app.core.health.books_health import Finding

    assert "clean" in _format("Test Restaurant", [])
    text = _format(
        "Test Restaurant",
        [Finding("unbalanced_entry", "critical", "abc", "out by 1 kuruş")],
    )
    assert "critical" in text
    assert "unbalanced_entry" in text
    assert "out by 1 kuruş" in text
