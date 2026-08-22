"""A partner row says who or what it was for.

The owner, reading their own ledger: "i want the description to show if
partner paid salary then which employee salary show name". Three salaries
fronted in one week read "Temmuz maaşı" three times, and the partner statement
could not say whose.

Nothing had to be recorded to fix it. `post_partner_funded_period_salary` has
stored `reference_type="staff_employee"` and the employee id on the partner
row since it was written; no reader ever looked. The same is true of the two
personal splits, which point at the expense and at the supplier payment they
came from.

Keyed on `reference_type` rather than movement type on purpose: a personal
expense split and cash a partner took are both `drawing`, and only one of them
points at anything.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.partners import posting as partner_posting
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.row_subjects import RESOLVERS, subject_names
from app.core.partners.types import PartnerMovementType
from app.core.staff.partner_funded_payment import post_partner_funded_period_salary
from app.db.session import entity_context
from app.features.partners import ledger_export
from app.features.partners import service as partner_service
from app.features.reports.subledger_export import effective_entries
from app.features.partners.models import Partner
from tests.test_staff import ACTOR_ID, staff_setup  # noqa: F401

SALARY = 3_250_000

#: `staff_setup` names its employee this. Asserted against by name below,
#: which is the whole point of the feature.
EMPLOYEE_NAME = "Ali Yilmaz"


@pytest.fixture
def partner_fronted_a_salary(db_session, staff_setup):  # noqa: F811
    """A partner pays one employee's net salary out of their own pocket."""
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    with entity_context(db_session, entity_id):
        partner = Partner(name="Canan Takan")
        db_session.add(partner)
        db_session.commit()
        db_session.refresh(partner)
        partner_id = partner.id

    post_partner_funded_period_salary(
        db_session,
        entity_id,
        employee_id,
        partner_id,
        payment_date=date(2026, 8, 5),
        amount_minor=SALARY,
        period_year=2026,
        period_month=7,
        period_salary_minor=SALARY,
        description="Temmuz maaşı",
        actor_id=ACTOR_ID,
    )
    return entity_id, partner_id


def _row(ledger, movement_type: PartnerMovementType):
    return next(e for e in ledger.entries if e.movement_type == movement_type)


def test_the_salary_row_names_the_employee(db_session, partner_fronted_a_salary):
    entity_id, partner_id = partner_fronted_a_salary
    ledger = partner_service.get_partner_ledger(db_session, entity_id, partner_id)
    row = _row(ledger, PartnerMovementType.SALARY_FRONTED)
    assert row.subject_name == EMPLOYEE_NAME, (
        "the row has carried the employee id all along; this is the read-back"
    )
    assert EMPLOYEE_NAME in row.description
    assert "Canan Takan" in row.description


def test_a_row_pointing_at_nothing_stays_unnamed(db_session, partner_fronted_a_salary):
    """Guard the guard.

    A resolver that named every row — or one that returned the partner's own
    name — would satisfy the assertion above while making every statement
    wrong. Cash a partner simply took points at nothing and must stay bare.
    """
    entity_id, partner_id = partner_fronted_a_salary
    with entity_context(db_session, entity_id):
        cash = {a.code: a.id for a in db_session.scalars(select(Account))}["1000"]
    partner_posting.post_drawing(
        db_session,
        entity_id,
        partner_id,
        drawing_date=date(2026, 8, 10),
        amount_kurus=100_000,
        description="Cashier sent it",
        actor_id=ACTOR_ID,
        payment_account_id=cash,
    )

    ledger = partner_service.get_partner_ledger(db_session, entity_id, partner_id)
    assert _row(ledger, PartnerMovementType.DRAWING).subject_name is None


def test_the_statement_carries_the_name_too(db_session, partner_fronted_a_salary):
    """PDF and Excel have one description column, so the name joins it there.

    Without this the page answers the owner's question and the statement they
    would actually keep does not.
    """
    entity_id, partner_id = partner_fronted_a_salary
    ledger = partner_service.get_partner_ledger(db_session, entity_id, partner_id)
    rows = ledger_export._rows(effective_entries(ledger.entries))
    salary = next(r for r in rows if EMPLOYEE_NAME in r.description)
    assert EMPLOYEE_NAME in salary.description
    assert "Canan Takan" in salary.description
    assert "Temmuz maaşı" in salary.description


def test_one_lookup_per_reference_type_not_per_row(db_session, partner_fronted_a_salary):
    """Fifty fronted salaries must not cost fifty lookups.

    Asserted through the resolver rather than by counting SQL, because what
    matters is the shape: ids are gathered per type and asked for together.
    """
    entity_id, partner_id = partner_fronted_a_salary
    with entity_context(db_session, entity_id):
        rows = list(
            db_session.scalars(
                select(PartnerLedgerEntry).where(
                    PartnerLedgerEntry.partner_id == partner_id
                )
            )
        )
        calls: list[int] = []
        original = RESOLVERS["staff_employee"]

        def counting(session, ids):
            calls.append(len(ids))
            return original(session, ids)

        RESOLVERS["staff_employee"] = counting
        try:
            names = subject_names(db_session, rows * 3)
        finally:
            RESOLVERS["staff_employee"] = original

    assert len(calls) == 1, "one lookup for the whole page, whatever its length"
    assert names, "and it still answers"


def test_an_unknown_reference_type_is_ignored(db_session, partner_fronted_a_salary):
    """A reference this build does not understand leaves the row as it was.

    Reference types outlive the code that reads them — a row written by a
    newer build, or one whose subject has since been deleted. Neither should
    take the ledger down; both should read exactly as they do today.
    """
    entity_id, _partner_id = partner_fronted_a_salary

    class Row:
        id = "r1"
        reference_type = "something_from_the_future"
        reference_id = "x"

    with entity_context(db_session, entity_id):
        assert subject_names(db_session, [Row()]) == {}


def test_every_reference_written_has_a_resolver():
    """The two lists that have to agree, compared rather than assumed.

    Each `reference_type` a partner row is written with should be one this can
    name, or the feature quietly covers one of three cases. Reading the
    constants keeps it honest if a fourth is added.
    """
    from app.core.partners.posting import (
        EXPENSE_SPLIT_REFERENCE_TYPE,
        SUPPLIER_PAYMENT_SPLIT_REFERENCE_TYPE,
    )
    from app.core.partners.row_subjects import STAFF_EMPLOYEE_REFERENCE_TYPE

    written = {
        EXPENSE_SPLIT_REFERENCE_TYPE,
        SUPPLIER_PAYMENT_SPLIT_REFERENCE_TYPE,
        STAFF_EMPLOYEE_REFERENCE_TYPE,
    }
    assert written <= set(RESOLVERS), (
        f"no resolver for {written - set(RESOLVERS)} — those rows stay unnamed"
    )
