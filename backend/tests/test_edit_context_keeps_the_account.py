"""An edit context names the account the money actually moved through.

The account is on the journal entry's lines, never on the subledger row, so a
context built from the row alone drops it. That is not a visibly empty form:
every correction form falls back to the *first* wallet in the list, so the
picker reopens answered, with the wrong drawer, and saving reposts the money
there. Silent in both directions.

`_partner_ledger_context` was fixed for this and its docstring said "read once
here, so both are right". Customer, supplier and staff were never added. The
staff one only surfaced when the staff page stopped passing the ledger row
itself — which means the General ledger had been rewriting the account on
every staff correction the whole time.

`test_the_fallback_is_real` is the reason this matters rather than merely
being untidy, and it lives in the frontend guard beside it.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.core.ledger.entry_actions import resolve_ledger_entry_actions
from app.core.staff import posting as staff_posting
from app.core.staff.models import StaffLedgerEntry
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate

from tests.test_staff import ACTOR_ID, staff_setup  # noqa: F401

PERIOD = {"period_year": 2026, "period_month": 7}


@pytest.fixture
def second_drawer(db_session, staff_setup):  # noqa: F811
    """A second cash account, so "the first one" is not also the right one.

    With a single account the assertions below pass whether the context reads
    the entry or shrugs — which is how this went unnoticed.
    """
    entity_id = staff_setup["entity_id"]
    account = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Back office"),
    )
    with entity_context(db_session, entity_id):
        row = db_session.scalar(select(MoneyAccount).where(MoneyAccount.id == account.id))
        return row.gl_account_id


def _staff_edit_context(db_session, entity_id, journal_entry_id) -> dict:
    actions = resolve_ledger_entry_actions(db_session, entity_id, journal_entry_id)
    assert actions.edit is not None, "the entry should be editable"
    return actions.edit.context


def test_a_salary_payment_remembers_the_drawer_it_came_from(
    db_session, staff_setup, second_drawer  # noqa: F811
):
    result = staff_posting.post_period_salary_payment(
        db_session,
        staff_setup["entity_id"],
        staff_setup["employee_id"],
        payment_date=date(2026, 8, 5),
        cash_minor=3_000_000,
        period_salary_minor=3_000_000,
        description="Temmuz maaşı",
        actor_id=ACTOR_ID,
        payment_account_id=second_drawer,
        **PERIOD,
    )

    context = _staff_edit_context(
        db_session, staff_setup["entity_id"], result.journal_entry.id
    )
    assert context["payment_account_id"] == str(second_drawer), (
        "the form will otherwise reopen on the first wallet and move the "
        "money there on save"
    )


def test_the_other_drawer_is_reported_too(
    db_session, staff_setup, second_drawer  # noqa: F811
):
    """Guard the guard.

    A context returning any fixed account — or the first one always — would
    satisfy the test above. Paying from the original drawer has to come back
    as the original drawer.
    """
    drawer = staff_setup["drawer"].gl_account_id
    assert drawer != second_drawer

    result = staff_posting.post_advance_paid(
        db_session,
        staff_setup["entity_id"],
        staff_setup["employee_id"],
        payment_date=date(2026, 8, 2),
        amount_minor=500_000,
        description="Avans",
        actor_id=ACTOR_ID,
        payment_account_id=drawer,
    )

    context = _staff_edit_context(
        db_session, staff_setup["entity_id"], result.journal_entry.id
    )
    assert context["payment_account_id"] == str(drawer)


def test_a_payment_that_consumed_an_advance_still_reports_one_account(
    db_session, staff_setup, second_drawer  # noqa: F811
):
    """Several subledger rows, one money line.

    The account is read from the entry's *lines*, so the extra advance-applied
    row changes nothing — but this is the shape that reaches the multi-row
    correction, so it is the one that would have hurt.
    """
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    staff_posting.post_salary_accrual(
        db_session, entity_id, employee_id,
        accrual_date=date(2026, 8, 1), amount_minor=3_000_000,
        description="Tahakkuk", actor_id=ACTOR_ID, **PERIOD,
    )
    staff_posting.post_advance_paid(
        db_session, entity_id, employee_id,
        payment_date=date(2026, 8, 2), amount_minor=500_000,
        description="Avans", actor_id=ACTOR_ID,
        payment_account_id=staff_setup["drawer"].gl_account_id,
    )
    result = staff_posting.post_period_salary_payment(
        db_session, entity_id, employee_id,
        payment_date=date(2026, 8, 5), cash_minor=2_500_000,
        period_salary_minor=3_000_000, description="Temmuz maaşı",
        actor_id=ACTOR_ID, payment_account_id=second_drawer, **PERIOD,
    )

    with entity_context(db_session, entity_id):
        rows = db_session.scalars(
            select(StaffLedgerEntry).where(
                StaffLedgerEntry.journal_entry_id == result.journal_entry.id
            )
        ).all()
    assert len(rows) > 1, "meant to be the multi-row shape"

    context = _staff_edit_context(db_session, entity_id, result.journal_entry.id)
    assert context["payment_account_id"] == str(second_drawer)


def test_every_context_with_a_picker_declares_the_key():
    """The enumeration, on this side of the wire.

    The frontend guard checks the same four and would catch a missing key on
    its own — but only for a kind it already lists. This one is keyed on the
    contexts themselves, so a context that quietly loses the call fails here
    without anyone remembering to update a list in the other repo half.
    """
    import inspect

    from app.core.ledger import entry_contexts

    for name in (
        "_partner_ledger_context",
        "_staff_ledger_context",
        "_customer_payment_context",
        "_supplier_row_context",
    ):
        source = inspect.getsource(getattr(entry_contexts, name))
        assert "_money_account_id(session, entry)" in source, (
            f"{name} builds its form's account picker from nothing — it will "
            "reopen on the first wallet in the list"
        )


def test_the_helper_gives_up_rather_than_guessing(db_session, staff_setup):  # noqa: F811
    """An entry with no money line reports None, not an arbitrary account.

    An accrual moves no cash. Returning "some account" here would be worse
    than returning nothing: the form has no picker to fill, but the ledger
    would be asserting a payment account that does not exist.
    """
    from app.core.ledger.entry_contexts import _money_account_id
    from app.core.ledger.models import JournalEntry

    entity_id = staff_setup["entity_id"]
    result = staff_posting.post_salary_accrual(
        db_session, entity_id, staff_setup["employee_id"],
        accrual_date=date(2026, 8, 1), amount_minor=3_000_000,
        description="Tahakkuk", actor_id=ACTOR_ID, **PERIOD,
    )

    with entity_context(db_session, entity_id):
        entry = db_session.get(JournalEntry, result.journal_entry.id)
        assert _money_account_id(db_session, entry) is None


def test_it_is_the_same_helper_everywhere():
    """One reader, not four.

    Four copies of "find the money line" is how three of them ended up not
    existing at all.
    """
    import inspect

    from app.core.ledger import entry_contexts

    source = inspect.getsource(entry_contexts)
    assert source.count("def _money_account_id") == 1
    assert source.count("money_account_gl_by_journal_entry(session") == 1


def test_uuids_are_not_asserted_by_accident():
    """Guard the guard: `str(account)` of a UUID must match the picker's value.

    The frontend compares this against `gl_account_id` sent by the accounts
    endpoint. If one side ever stringifies differently the compare silently
    fails and the fallback takes over — the same silent wrong answer.
    """
    value = uuid.UUID("00000000-0000-4000-8000-000000000009")
    assert str(value) == "00000000-0000-4000-8000-000000000009"
