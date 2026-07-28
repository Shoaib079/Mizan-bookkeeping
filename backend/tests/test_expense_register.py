"""Expense register — every expense posting in one list, tying to the P&L."""

from __future__ import annotations

from datetime import date

import pytest

from app.core.chart_of_accounts.default_chart import SALARY_EXPENSE_CODE
from app.core.staff import posting as staff_posting
from app.features.reports import expense_register, financial_statements
from app.features.reports.service import InvalidDateRangeError

from tests.test_staff import ACTOR_ID, staff_setup  # noqa: F401


def _register(db_session, entity_id, **kwargs):
    return expense_register.get_expense_register(
        db_session, entity_id, date(2026, 6, 1), date(2026, 6, 30), **kwargs
    )


def test_register_collects_expenses_from_different_flows(db_session, staff_setup):
    """Salary and extra days are recorded on different screens — one list here."""
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 6, 10),
        amount_minor=500_000,
        description="June salary",
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=6,
    )
    staff_posting.post_extra_days_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 12),
        extra_days=2,
        per_day_minor=50_000,
        description="Extra days",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    report = _register(db_session, entity_id)

    assert report.entry_count == 2
    assert report.total_kurus == 600_000
    descriptions = {row.description for row in report.rows}
    assert descriptions == {"June salary", "Extra days"}
    # Rows are chronological so a month reads like a statement.
    assert [row.entry_date for row in report.rows] == [
        date(2026, 6, 10),
        date(2026, 6, 12),
    ]


def test_register_total_ties_to_profit_and_loss(db_session, staff_setup):
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]

    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 6, 10),
        amount_minor=750_000,
        description="June salary",
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=6,
    )

    report = _register(db_session, entity_id)
    pnl = financial_statements.get_profit_and_loss(
        db_session, entity_id, date(2026, 6, 1), date(2026, 6, 30)
    )
    assert report.total_kurus == pnl.total_expenses_kurus


def test_register_excludes_voided_entries(db_session, staff_setup):
    from app.core.ledger.posting import void_journal_entry

    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]

    result = staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 6, 10),
        amount_minor=500_000,
        description="Mistake",
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=6,
    )
    void_journal_entry(
        db_session,
        entity_id,
        result.journal_entry.id,
        actor_id=ACTOR_ID,
        reason="wrong",
    )

    report = _register(db_session, entity_id)
    assert report.entry_count == 0
    assert report.total_kurus == 0


def test_register_filters_by_account_and_search(db_session, staff_setup):
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    accounts = staff_setup["accounts"]

    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 6, 10),
        amount_minor=500_000,
        description="June salary",
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=6,
    )

    by_account = _register(
        db_session, entity_id, account_id=accounts[SALARY_EXPENSE_CODE]
    )
    assert by_account.entry_count == 1

    hit = _register(db_session, entity_id, q="salary")
    assert hit.entry_count == 1
    miss = _register(db_session, entity_id, q="zzz-nothing")
    assert miss.entry_count == 0


def test_register_groups_totals_by_account(db_session, staff_setup):
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]

    for day, amount in ((10, 300_000), (20, 200_000)):
        staff_posting.post_salary_accrual(
            db_session,
            entity_id,
            employee_id,
            accrual_date=date(2026, 6, day),
            amount_minor=amount,
            description=f"Salary {day}",
            actor_id=ACTOR_ID,
            period_year=2026,
            period_month=6,
        )

    report = _register(db_session, entity_id)
    salary_total = next(
        t for t in report.account_totals if t.account_code == SALARY_EXPENSE_CODE
    )
    assert salary_total.amount_kurus == 500_000
    assert salary_total.entry_count == 2


def test_register_rejects_backwards_range(db_session, staff_setup):
    entity_id = staff_setup["entity_id"]
    with pytest.raises(InvalidDateRangeError):
        expense_register.get_expense_register(
            db_session, entity_id, date(2026, 6, 30), date(2026, 6, 1)
        )
