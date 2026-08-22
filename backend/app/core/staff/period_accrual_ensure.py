"""Ensure period salary accrual is topped up before payment (staff posting)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import (
    SALARIES_PAYABLE_CODE,
    SALARY_EXPENSE_CODE,
)
from app.core.staff import ledger as staff_ledger
from app.core.staff.types import PayCurrency
from app.features.staff.ledger_display_description import compose_staff_post_description


def ensure_period_accrual_up_to(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    *,
    accrual_date: date,
    period_year: int,
    period_month: int,
    period_salary_minor: int,
    actor_id: uuid.UUID,
) -> None:
    """Top up or create the period accrual so payment can settle against it."""
    from app.core.ledger.correction import correct_staff_journal_entry
    from app.core.staff.ledger_effective import effective_accrual_rows_for_period
    from app.core.staff.posting import (
        InvalidStaffPostingError,
        _chart_account,
        _get_employee,
        build_try_salary_accrual_lines,
        post_salary_accrual,
    )

    current = staff_ledger.period_accrued_minor(
        session, employee_id, period_year=period_year, period_month=period_month
    )
    if period_salary_minor == current:
        return
    if period_salary_minor < current:
        raise InvalidStaffPostingError(
            f"Salary for {period_month:02d}/{period_year} is already accrued at "
            f"{current} minor units — correct the accrual to lower it."
        )

    effective_rows = effective_accrual_rows_for_period(
        session,
        employee_id,
        period_year=period_year,
        period_month=period_month,
    )
    if effective_rows:
        primary = max(effective_rows, key=lambda row: row.created_at)
        others_sum = current - primary.amount_minor
        new_primary_amount = period_salary_minor - others_sum
        if new_primary_amount == primary.amount_minor:
            return
        if new_primary_amount <= 0:
            raise InvalidStaffPostingError(
                f"Multiple accruals exist for {period_month:02d}/{period_year} — "
                "use Correct on the ledger row to consolidate before changing salary."
            )
        if primary.journal_entry_id is None:
            raise InvalidStaffPostingError(
                "FX salary accrual for this period cannot be adjusted via payment — "
                "use Adjust accrual."
            )
        employee = _get_employee(session, entity_id, employee_id)
        if employee.pay_currency != PayCurrency.TRY:
            raise InvalidStaffPostingError(
                "FX salary accrual adjustment via payment is not supported — "
                "use Adjust accrual."
            )
        salary_expense = _chart_account(session, SALARY_EXPENSE_CODE)
        salaries_payable = _chart_account(session, SALARIES_PAYABLE_CODE)
        lines = build_try_salary_accrual_lines(
            salary_expense_id=salary_expense.id,
            salaries_payable_id=salaries_payable.id,
            amount_kurus=new_primary_amount,
        )
        accrual_description = compose_staff_post_description(
            movement_type="salary_accrued",
            employee_name=employee.name,
            period_year=period_year,
            period_month=period_month,
        )
        correct_staff_journal_entry(
            session,
            entity_id,
            primary.journal_entry_id,
            accrual_date,
            accrual_description,
            lines,
            actor_id=actor_id,
            amount_minor=new_primary_amount,
        )
        return

    employee = _get_employee(session, entity_id, employee_id)
    accrual_description = compose_staff_post_description(
        movement_type="salary_accrued",
        employee_name=employee.name,
        period_year=period_year,
        period_month=period_month,
    )
    post_salary_accrual(
        session,
        entity_id,
        employee_id,
        accrual_date=accrual_date,
        amount_minor=period_salary_minor,
        description=accrual_description,
        actor_id=actor_id,
        period_year=period_year,
        period_month=period_month,
    )
