"""A voided entry must not leave a bank line pointing at it (Phase 1.1).

The reported symptom: *"i voided it but i can still see the invoice in review
invoices and i can open review and the invoice is there clicked void again
nothing happened just kinda flickered but still everything there."*

The entry was voided. The statement line pointing at it was never told, so
every reconciliation screen went on believing the line was posted, and the
second press of Void found an entry that was already void and did nothing.

`retarget_statement_lines_for_journal` existed for this and was called from
one place out of six. This file holds the rule in two ways: a scan that no
future void path can slip past, and behaviour on both sides of the fork —
a void resets the line, a correction re-points it.
"""

from __future__ import annotations

import ast
import pathlib
import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_PAYABLE_CODE,
    GENERAL_EXPENSE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntrySource
from app.core.ledger.posting import (
    PostingLine,
    correct_journal_entry,
    prepare_journal_entry,
    void_journal_entry,
)
from app.db.session import entity_context
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    BankStatement,
    BankStatementLine,
    StatementLineClassification,
    StatementLineStatus,
)
from app.features.banking import service as banking_service

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")

BACKEND = pathlib.Path(__file__).resolve().parents[1]

# The operation that *is* voiding an entry. Anything that marks an original
# voided has, by definition, made the entry it points at stop being the truth.
VOID_MARKER = "_mark_original_voided"
RETARGET = "_retarget_statement_lines"


def _functions_calling(marker: str) -> list[tuple[str, str, set[str]]]:
    """Every function that calls `marker`, with the set of names it calls.

    Parsed rather than grepped: a regex over source cannot tell which function
    body a line belongs to, and "somewhere in the same file" is exactly the
    looseness that let four paths drift.
    """
    found: list[tuple[str, str, set[str]]] = []
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
            if marker in called and node.name != f"def {marker}":
                found.append((str(path.relative_to(BACKEND)), node.name, called))
    return found


def test_the_scan_actually_finds_the_void_paths():
    """Guard the guard: a scan that finds nothing passes for the wrong reason.

    This is the failure I produced three times in one evening — an assertion
    that holds because the thing it searches came back empty.
    """
    voiders = _functions_calling(VOID_MARKER)
    assert len(voiders) >= 4, (
        f"expected the known void funnels, found {[v[1] for v in voiders]} — "
        "if voiding was renamed, this scan is now blind and must be updated"
    )


def test_every_path_that_voids_an_entry_retargets_its_statement_lines():
    """No allowlist, deliberately.

    Some of these can never have a bank line pointing at them — a profit
    allocation moves no cash. They call it anyway. An exception list is a
    place for the next gap to hide, and the cost of the rule holding
    everywhere is one query that finds nothing.
    """
    missing = [
        f"{path}::{name}"
        for path, name, called in _functions_calling(VOID_MARKER)
        if RETARGET not in called
    ]
    assert missing == [], (
        "these void an entry without telling the bank lines that point at it:\n  "
        + "\n  ".join(missing)
        + f"\n\nCall {RETARGET}(session, entry_id) alongside {VOID_MARKER}. "
        "Pass the replacement entry id if the entry is being corrected rather "
        "than voided outright — see retarget_statement_lines_for_journal."
    )


# --- behaviour -----------------------------------------------------------


@pytest.fixture
def linked_line(db_session, restaurant_a):
    """A posted entry with a bank statement line pointing at it."""
    entity_id = restaurant_a.id
    seed_default_chart(db_session, entity_id)
    account = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.BANK, name="Ziraat"),
    )

    with entity_context(db_session, entity_id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        entry = prepare_journal_entry(
            db_session,
            entity_id,
            date(2026, 7, 15),
            "Something off the bank",
            [
                PostingLine(
                    account_id=accounts[GENERAL_EXPENSE_CODE],
                    amount_kurus=50_000,
                    side=AccountNormalBalance.DEBIT,
                ),
                PostingLine(
                    account_id=accounts[ACCOUNTS_PAYABLE_CODE],
                    amount_kurus=50_000,
                    side=AccountNormalBalance.CREDIT,
                ),
            ],
            actor_id=ACTOR_ID,
            source=JournalEntrySource.MANUAL,
        )
        db_session.flush()

        statement = BankStatement(
            money_account_id=account.id,
            file_fingerprint="f" * 64,
            period_start=date(2026, 7, 1),
            period_end=date(2026, 7, 31),
            original_filename="temmuz.pdf",
            line_count=1,
        )
        db_session.add(statement)
        db_session.flush()

        line = BankStatementLine(
            statement_id=statement.id,
            transaction_date=date(2026, 7, 15),
            description="ODEME",
            amount_kurus=-50_000,
            dedup_key="d" * 32,
            classification=StatementLineClassification.STORE_PURCHASE,
            status=StatementLineStatus.POSTED,
            journal_entry_id=entry.id,
        )
        db_session.add(line)
        db_session.commit()
        return {
            "entity_id": entity_id,
            "entry_id": entry.id,
            "line_id": line.id,
            "accounts": accounts,
        }


def _line(db_session, entity_id, line_id) -> BankStatementLine:
    with entity_context(db_session, entity_id):
        return db_session.get(BankStatementLine, line_id)


def test_voiding_hands_the_line_back_to_the_queue(db_session, linked_line):
    """The bug, end to end: void, and the line stops claiming to be posted."""
    entity_id = linked_line["entity_id"]

    before = _line(db_session, entity_id, linked_line["line_id"])
    assert before.status == StatementLineStatus.POSTED

    void_journal_entry(
        db_session, entity_id, linked_line["entry_id"], actor_id=ACTOR_ID, reason="dup"
    )

    after = _line(db_session, entity_id, linked_line["line_id"])
    assert after.status == StatementLineStatus.IMPORTED
    assert after.journal_entry_id is None
    assert after.classification == StatementLineClassification.UNCLASSIFIED


def test_correcting_re_points_the_line_and_does_not_free_it(db_session, linked_line):
    """The other half, and the more dangerous one to get wrong.

    A correction voids and reposts, so the money is still in the ledger under
    a new entry. Resetting the line here would put it back in the queue as
    unclassified while its transaction was already booked — an invitation to
    classify it a second time and book the same 500 ₺ twice. It must follow
    the entry, not be released.
    """
    entity_id = linked_line["entity_id"]
    accounts = linked_line["accounts"]

    _original, _reversal, corrected = correct_journal_entry(
        db_session,
        entity_id,
        linked_line["entry_id"],
        date(2026, 7, 15),
        "Something off the bank — corrected",
        [
            PostingLine(
                account_id=accounts[GENERAL_EXPENSE_CODE],
                amount_kurus=42_000,
                side=AccountNormalBalance.DEBIT,
            ),
            PostingLine(
                account_id=accounts[ACCOUNTS_PAYABLE_CODE],
                amount_kurus=42_000,
                side=AccountNormalBalance.CREDIT,
            ),
        ],
        actor_id=ACTOR_ID,
        reason="wrong amount",
    )

    after = _line(db_session, entity_id, linked_line["line_id"])
    assert after.status == StatementLineStatus.POSTED, "still reconciled — it is"
    assert after.journal_entry_id == corrected.id, "follows the money to the new entry"
    assert after.classification == StatementLineClassification.STORE_PURCHASE


def test_the_health_check_agrees_afterwards(db_session, linked_line):
    """The invariant, not just the field values.

    Check 0.3 is what would catch this in production. If voiding leaves the
    books in a state it complains about, the fix did not work.
    """
    from app.core.health.books_health import check_statement_lines_claiming_posted

    entity_id = linked_line["entity_id"]
    assert check_statement_lines_claiming_posted(db_session, entity_id) == []

    void_journal_entry(
        db_session, entity_id, linked_line["entry_id"], actor_id=ACTOR_ID, reason="dup"
    )

    assert check_statement_lines_claiming_posted(db_session, entity_id) == []
