"""Salary owed and advance held cannot both stand.

The owner: *"salaries were cleared out net is zero but when i am recording
salary the app still shows me i owe this staff money"* — and, on why staff
needs an Apply advance button at all when partners just net: *"we can get rid
of the advance owed and advance held we do not need them just like we cleaned
the partners page"*.

Partners net because they are one account. Staff is two — 1300 Employee
Advances and 2250 Salaries Payable — and two accounts do not move value
between themselves. Until the accounts are actually merged, the invariant is
enforced instead: after any staff write, whatever the two sides have in common
is settled through the same poster the button uses.

The tests below are ordered by how the overlap arises, because payment time is
not the only way in and fixing only that would have left Yasir Khan's exact
case untouched.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from app.core.staff import ledger as staff_ledger
from app.core.staff.advance_settlement import (
    AUTO_SETTLE_DESCRIPTION,
    settle_advance_against_owed,
    settleable_minor,
)
from app.core.subledger.control_account_tie import assert_entity_control_accounts_tied
from app.db.session import entity_context
from app.features.staff import service as staff_service
from app.features.staff.models import Employee
from app.features.staff.schema import (
    StaffAccrualCreate,
    StaffAdvanceCreate,
    StaffPaymentCreate,
)

from tests.test_staff import ACTOR_ID, staff_setup  # noqa: F401

PERIOD = {"period_year": 2026, "period_month": 7}


def _positions(db_session, ctx) -> tuple[int, int]:
    """(salary owed, advance held) — the two numbers on the staff card."""
    with entity_context(db_session, ctx["entity_id"]):
        return (
            staff_ledger.remaining_accrual_minor(db_session, ctx["employee_id"]),
            staff_ledger.outstanding_advance_minor(db_session, ctx["employee_id"]),
        )


def _accrue(db_session, ctx, amount, *, when=date(2026, 8, 1)):
    return staff_service.record_accrual(
        db_session, ctx["entity_id"], ctx["employee_id"],
        StaffAccrualCreate(
            accrual_date=when, amount_minor=amount, description="Tahakkuk",
            actor_id=ACTOR_ID, **PERIOD,
        ),
    )


def _advance(db_session, ctx, amount, *, when=date(2026, 8, 2)):
    return staff_service.record_advance(
        db_session, ctx["entity_id"], ctx["employee_id"],
        StaffAdvanceCreate(
            payment_date=when, amount_minor=amount, description="Avans",
            actor_id=ACTOR_ID, payment_account_id=ctx["drawer"].gl_account_id,
        ),
    )


def _pay(db_session, ctx, cash, *, salary, when=date(2026, 8, 5)):
    return staff_service.record_payment(
        db_session, ctx["entity_id"], ctx["employee_id"],
        StaffPaymentCreate(
            payment_date=when, amount_minor=cash, period_salary_minor=salary,
            description="Temmuz maaşı", actor_id=ACTOR_ID,
            payment_account_id=ctx["drawer"].gl_account_id, **PERIOD,
        ),
    )


# --- the way in the owner hit ---------------------------------------------


def test_an_advance_taken_against_salary_already_owed_settles_at_once(
    db_session, staff_setup  # noqa: F811
):
    """Accrue, then advance. The advance is immediately owed back out of it."""
    _accrue(db_session, staff_setup, 3_000_000)
    _advance(db_session, staff_setup, 1_000_000)

    owed, advance = _positions(db_session, staff_setup)
    assert advance == 0, "the advance should have been netted, not parked"
    assert owed == 2_000_000


def test_paying_the_full_salary_in_cash_leaves_nothing_stranded(
    db_session, staff_setup  # noqa: F811
):
    """The shape that produced the report.

    `post_salary_payment` applies an advance only against the part cash did
    not cover, so paying the exact amount owed used to leave the advance
    untouched beside a zero balance.
    """
    _accrue(db_session, staff_setup, 3_000_000)
    _advance(db_session, staff_setup, 500_000)
    # Settled on the way in, so 2.500.000 is what is left owed.
    owed_before, _ = _positions(db_session, staff_setup)
    _pay(db_session, staff_setup, owed_before, salary=3_000_000)

    owed, advance = _positions(db_session, staff_setup)
    assert (owed, advance) == (0, 0)


def test_editing_an_accrual_upward_does_not_strand_an_advance(
    db_session, staff_setup  # noqa: F811
):
    """Yasir Khan's actual route in — no payment involved at the moment it
    forms. A payment parks a surplus as advance; the accrual behind it is then
    edited up, and the payment's split is never revisited. Both sides stand.
    """
    _accrue(db_session, staff_setup, 3_000_000)
    _pay(db_session, staff_setup, 3_200_000, salary=3_000_000)
    _, advance = _positions(db_session, staff_setup)
    assert advance == 200_000, "the surplus should be parked as an advance"

    # The accrual moves up afterwards — now 200.000 is owed *and* 200.000 is
    # held. Before the invariant, this is precisely where it stopped.
    _accrue(db_session, staff_setup, 200_000, when=date(2026, 8, 6))

    owed, advance = _positions(db_session, staff_setup)
    assert (owed, advance) == (0, 0)


# --- the other direction ---------------------------------------------------


def test_an_advance_with_no_salary_owed_stays_an_advance(
    db_session, staff_setup  # noqa: F811
):
    """Guard the guard.

    Something that cleared every advance unconditionally would satisfy all
    three tests above and destroy the feature. Money genuinely lent with
    nothing owed against it must stay on the books as an advance.
    """
    _advance(db_session, staff_setup, 1_000_000)

    owed, advance = _positions(db_session, staff_setup)
    assert (owed, advance) == (0, 1_000_000)


def test_salary_owed_with_no_advance_is_left_alone(db_session, staff_setup):  # noqa: F811
    _accrue(db_session, staff_setup, 3_000_000)

    owed, advance = _positions(db_session, staff_setup)
    assert (owed, advance) == (3_000_000, 0)


def test_only_the_overlap_is_settled(db_session, staff_setup):  # noqa: F811
    """The smaller of the two goes; the remainder of the larger stays."""
    _accrue(db_session, staff_setup, 3_000_000)
    _advance(db_session, staff_setup, 4_000_000)

    owed, advance = _positions(db_session, staff_setup)
    assert owed == 0
    assert advance == 1_000_000, "only what was owed should have been netted"


# --- what it must not disturb ---------------------------------------------


def test_the_balance_is_unchanged_by_settling(db_session, staff_setup):  # noqa: F811
    """Apply-advance moves 2250 against 1300 and leaves the subledger balance
    where it was — that is what makes this safe to do without being asked."""
    _accrue(db_session, staff_setup, 3_000_000)
    before = staff_service.current_balance_minor(
        db_session, staff_setup["entity_id"], staff_setup["employee_id"]
    )
    _advance(db_session, staff_setup, 1_000_000)
    after = staff_service.current_balance_minor(
        db_session, staff_setup["entity_id"], staff_setup["employee_id"]
    )
    # The advance itself moves the balance by its own amount; the settle adds
    # nothing on top of that.
    assert after == before - 1_000_000


def test_the_books_still_tie(db_session, staff_setup):  # noqa: F811
    _accrue(db_session, staff_setup, 3_000_000)
    _advance(db_session, staff_setup, 1_000_000)
    _pay(db_session, staff_setup, 2_000_000, salary=3_000_000)

    with entity_context(db_session, staff_setup["entity_id"]):
        assert_entity_control_accounts_tied(db_session, staff_setup["entity_id"])


def test_the_entry_says_it_was_not_typed_by_hand(db_session, staff_setup):  # noqa: F811
    """An owner reading the ledger should be able to tell."""
    from app.core.staff.models import StaffLedgerEntry

    _accrue(db_session, staff_setup, 3_000_000)
    _advance(db_session, staff_setup, 1_000_000)

    with entity_context(db_session, staff_setup["entity_id"]):
        descriptions = db_session.scalars(
            select(StaffLedgerEntry.description).where(
                StaffLedgerEntry.employee_id == staff_setup["employee_id"]
            )
        ).all()
    assert AUTO_SETTLE_DESCRIPTION in descriptions


# --- the two deliberate refusals ------------------------------------------


def test_an_fx_employee_is_left_alone(db_session, staff_setup):  # noqa: F811
    """`post_apply_advance` is TRY-only because an FX advance carries a lira
    cost basis from its own day. Forcing this on them would book the expense
    at today's rate instead."""
    from app.core.staff.types import PayCurrency

    entity_id = staff_setup["entity_id"]
    with entity_context(db_session, entity_id):
        employee = db_session.get(Employee, staff_setup["employee_id"])
        employee.pay_currency = PayCurrency.USD
        db_session.commit()

    posted = settle_advance_against_owed(
        db_session, entity_id, staff_setup["employee_id"],
        on_date=date(2026, 8, 7), actor_id=ACTOR_ID,
    )
    assert posted is None


def test_it_is_idempotent(db_session, staff_setup):  # noqa: F811
    """Called twice, it posts once — the termination argument for calling it
    after every write, including after itself."""
    _accrue(db_session, staff_setup, 3_000_000)
    _advance(db_session, staff_setup, 1_000_000)

    again = settle_advance_against_owed(
        db_session, staff_setup["entity_id"], staff_setup["employee_id"],
        on_date=date(2026, 8, 7), actor_id=ACTOR_ID,
    )
    assert again is None

    with entity_context(db_session, staff_setup["entity_id"]):
        assert settleable_minor(db_session, staff_setup["employee_id"]) == 0


def test_every_staff_write_holds_the_invariant():
    """The enumeration.

    An invariant enforced at six of seven call sites is not an invariant, and
    "we will remember to add it" is what the comment above the last exempt
    list said too. Keyed on the service's own write functions so a new one
    cannot be added without this failing.
    """
    import inspect

    from app.features.staff import service

    writes = [
        "record_accrual",
        "record_advance",
        "record_advance_return",
        "record_extra_days_paid",
        "record_payment",
        "_correct_staff_payment_http",
        "correct_staff_journal_entry_http",
        "void_staff_journal_entry_http",
    ]
    missing = [
        name
        for name in writes
        if "_settle_advance(" not in inspect.getsource(getattr(service, name))
    ]
    assert missing == [], (
        f"these staff writes can leave an advance standing beside salary "
        f"owed: {missing}"
    )


def test_the_enumeration_names_real_functions():
    """Guard the guard: a typo in the list above would exempt a live path."""
    import inspect

    from app.features.staff import service

    source = inspect.getsource(service)
    assert source.count("def _settle_advance(") == 1
    # Every call must be inside a function that actually writes, not merely
    # present somewhere in the file.
    assert source.count("_settle_advance(") >= 9


def test_the_poster_refuses_a_second_empty_apply(db_session, staff_setup):  # noqa: F811
    """The poster stays; the button and its route are gone.

    The owner, on the button: *"when we will have a plus and minus addition
    and subtraction will we really need that no i do not think so"*. Right —
    once the overlap is settled on every write there is never anything for a
    person to apply, so the menu item only offered a way to be confused.

    `post_apply_advance` itself is not dead code: it is what the invariant
    posts through, and what `payment_correction` reposts an apply-advance
    with. This holds down that it still refuses when there is nothing left,
    which is the guard against a settle firing twice.
    """
    from app.core.staff.posting import InvalidStaffPostingError, post_apply_advance

    _accrue(db_session, staff_setup, 3_000_000)
    _advance(db_session, staff_setup, 1_000_000)

    with pytest.raises(InvalidStaffPostingError, match="Nothing to apply"):
        post_apply_advance(
            db_session, staff_setup["entity_id"], staff_setup["employee_id"],
            applied_date=date(2026, 8, 7), description="By hand",
            actor_id=ACTOR_ID,
        )


def test_the_manual_route_is_gone(client):
    """No orphan endpoint behind the removed button.

    A route left registered with nothing calling it is the shape the owner
    asked to be rid of: it would still accept a hand-rolled request and post
    an entry the app can no longer produce or explain.
    """
    paths = client.app.openapi()["paths"]
    offenders = [p for p in paths if p.endswith("/apply-advance")]
    assert offenders == [], offenders
