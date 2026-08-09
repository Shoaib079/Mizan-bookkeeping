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
    Finding,
    check_assumed_vat_posted,
    check_drafts_claiming_posted,
    check_future_dated_entries,
    run_books_health,
    unbalanced_findings,
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


def test_the_database_refuses_to_create_an_unbalanced_entry(db_session, books):
    """Writing the fault is impossible, and that is the point worth pinning.

    `journal_entry_lines` carries an immutability trigger — no UPDATE at all
    — so an entry cannot be knocked out of balance after posting, and posting
    refuses to write one unbalanced. This test exists because the first
    version of the unbalanced test tried to create the state and was stopped
    by the database. Two guards, both in code a migration can change; this
    asserts one of them is still there.
    """
    from app.core.ledger.models import ImmutableJournalError

    entry_id = _post_entry(db_session, books, entry_date=date(2026, 7, 31))
    with pytest.raises(ImmutableJournalError):
        with entity_context(db_session, books):
            line = db_session.scalar(
                select(JournalEntryLine).where(
                    JournalEntryLine.journal_entry_id == entry_id,
                    JournalEntryLine.side == AccountNormalBalance.CREDIT,
                )
            )
            line.amount_kurus += 1
            db_session.flush()
    db_session.rollback()


def test_the_unbalanced_arithmetic_finds_a_gap():
    """The check's judgement, tested directly since the state cannot be built.

    Separating it is not a workaround. It is the only way to prove the check
    would fire if the two guards above were ever relaxed — which is the whole
    reason to keep a backstop.
    """
    entry = uuid.uuid4()
    findings = unbalanced_findings({entry: {"debit": 12_000, "credit": 11_999}})
    assert [f.check for f in findings] == ["unbalanced_entry"]
    assert findings[0].severity == "critical"
    assert "out by 1" in findings[0].detail
    assert str(entry) in findings[0].subject


def test_the_unbalanced_arithmetic_stays_quiet_when_it_balances():
    assert unbalanced_findings({uuid.uuid4(): {"debit": 12_000, "credit": 12_000}}) == []


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


def test_findings_are_ordered_worst_first():
    """A long report has to lead with what matters, and be stable between
    runs — the plan compares a report taken before a refactor with one taken
    after, and ordering noise would make that comparison worthless."""
    from app.core.health.books_health import order_findings

    scrambled = [
        Finding("assumed_vat_posted", "medium", "b", ""),
        Finding("unbalanced_entry", "critical", "a", ""),
        Finding("future_dated_entry", "high", "c", ""),
        Finding("control_account_tie", "critical", "a", ""),
    ]
    ordered = order_findings(scrambled)
    assert [f.severity for f in ordered] == ["critical", "critical", "high", "medium"]
    # Ties broken by check name, so two runs over the same books agree.
    assert [f.check for f in ordered][:2] == ["control_account_tie", "unbalanced_entry"]


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


def test_a_stale_database_says_so_instead_of_stack_tracing():
    """The first real run of this hit a local database missing a column and
    answered with sixty lines of SQLAlchemy.

    A tool reached for when something already looks wrong has to fail in a
    sentence. The message names the missing column, the command that fixes
    it, and where production stands — so it cannot be mistaken for the books
    being broken.
    """
    from sqlalchemy.exc import ProgrammingError

    from app.core.health.cli import SchemaBehindError, _require_current_schema

    class Stale:
        def execute(self, *_):
            raise ProgrammingError(
                "SELECT entities.address", {}, Exception(
                    "column entities.address does not exist"
                )
            )

        def rollback(self):
            pass

    with pytest.raises(SchemaBehindError) as caught:
        _require_current_schema(Stale())

    message = str(caught.value)
    assert "behind the code" in message
    assert "alembic upgrade head" in message
    assert "entities.address" in message


def test_money_is_formatted_the_way_it_is_read():
    """The explain output is read by a person, so kuruş become lira."""
    from app.core.health.cli import _money

    assert _money(22_000_000) == "220.000,00 ₺"
    assert _money(-4_000_000) == "-40.000,00 ₺"
    assert _money(150_450) == "1.504,50 ₺"


def test_a_restaurant_can_be_named_rather_than_uuided(db_session, restaurant_a):
    """Nobody holds a UUID in their head."""
    from app.core.health.cli import _resolve_entity

    found = _resolve_entity(db_session, restaurant_a.name)
    assert found is not None
    assert found[0] == restaurant_a.id

    assert _resolve_entity(db_session, "no such restaurant") is None


def test_explaining_an_account_shows_both_sides(db_session, books):
    """A tie failure says two numbers differ. What is worth seeing is which
    movements each side counts — that is what separates drifted books from a
    check measuring the wrong thing."""
    from app.core.health.books_health import explain_account

    by_movement, by_source = explain_account(db_session, books, "3300")
    assert isinstance(by_movement, list)
    assert isinstance(by_source, list)


# --- listing the lines behind a total ------------------------------------


def test_entries_are_listed_with_a_date_so_a_mismatch_can_be_aged(db_session, books):
    """Totals cannot say *when*, and when is what decides the triage.

    Spice Corner had a partner drawing on the reimbursement payable while
    every code path that posts a drawing sends it elsewhere. Whether that is
    a live bug or a scar from an older build is a question about dates, and
    the breakdown by movement type could not answer it.
    """
    from app.core.health.books_health import account_entries

    _post_entry(db_session, books, entry_date=date(2026, 7, 1), amount=10_000)
    _post_entry(db_session, books, entry_date=date(2026, 7, 20), amount=25_000)

    rows = account_entries(db_session, books, ACCOUNTS_PAYABLE_CODE)
    assert [r.entry_date for r in rows] == [date(2026, 7, 20), date(2026, 7, 1)], (
        "newest first — the recent one is the one being triaged"
    )
    assert [r.signed_kurus for r in rows] == [25_000, 10_000], "payable credits are positive"


def test_a_voided_entry_and_its_reversal_both_disappear(db_session, books):
    """The bug that sent me hunting a hole in India Gate that was not there.

    A void leaves two rows: the original marked VOIDED and a mirror reversal
    marked POSTED. Filtering on POSTED alone drops the original and keeps the
    reversal, so the account reports a debit that undoes an entry it is no
    longer counting. The listing must show neither.
    """
    from app.core.health.books_health import account_entries
    from app.core.ledger.posting import void_journal_entry

    entry_id = _post_entry(db_session, books, entry_date=date(2026, 7, 1), amount=10_000)
    _post_entry(db_session, books, entry_date=date(2026, 7, 2), amount=7_000)
    assert len(account_entries(db_session, books, ACCOUNTS_PAYABLE_CODE)) == 2

    void_journal_entry(db_session, books, entry_id, actor_id=ACTOR_ID, reason="test")

    rows = account_entries(db_session, books, ACCOUNTS_PAYABLE_CODE)
    assert [r.signed_kurus for r in rows] == [7_000], (
        "the voided 10.000 and its reversal must both be gone, not net to zero "
        "and not appear as a lone -10.000"
    )


def test_the_source_filter_narrows_rather_than_empties(db_session, books):
    """Both halves: the right source is kept, a wrong one returns nothing.

    A filter tested only on the matching case passes just as well when it
    matches everything, which is how a guard ends up unable to fail.
    """
    from app.core.health.books_health import account_entries

    _post_entry(db_session, books, entry_date=date(2026, 7, 1), amount=10_000)

    kept = account_entries(
        db_session, books, ACCOUNTS_PAYABLE_CODE, sources={"manual"}
    )
    assert len(kept) == 1

    assert account_entries(
        db_session, books, ACCOUNTS_PAYABLE_CODE, sources={"partner_drawing"}
    ) == []


def test_an_account_that_does_not_exist_is_empty_not_an_error(db_session, books):
    """A typo in a code should print nothing, not stack trace at someone."""
    from app.core.health.books_health import account_entries

    assert account_entries(db_session, books, "9999") == []
