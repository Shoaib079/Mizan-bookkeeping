"""Paying an employee from the bank.

A period salary, an incentive, an advance. All three write `employee_id` onto
the line so the staff subledger and the statement agree about who was paid.
"""

from __future__ import annotations

from app.core.staff import posting as staff_posting
from app.core.staff.ledger import OverpaymentError as StaffOverpaymentError
from app.core.staff.posting import InvalidStaffPostingError
from app.features.banking.schema import ClassifyStatementLineResult
from app.features.banking.statement_classify_core import (
    InvalidClassificationError,
    _ClassifyContext,
    _finish_classified_line,
)
from app.features.banking.statement_models import StatementLineClassification


def _post_staff_payment(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    payment_amount = abs(ctx.line.amount_kurus)
    assert ctx.actor_id is not None
    assert ctx.employee_id is not None
    assert ctx.period_year is not None
    assert ctx.period_month is not None
    assert ctx.period_salary_minor is not None
    try:
        result = staff_posting.post_period_salary_payment(
            ctx.session,
            ctx.entity_id,
            ctx.employee_id,
            payment_date=ctx.line.transaction_date,
            cash_minor=payment_amount,
            period_year=ctx.period_year,
            period_month=ctx.period_month,
            period_salary_minor=ctx.period_salary_minor,
            description=ctx.line.description,
            actor_id=ctx.actor_id,
            payment_account_id=ctx.money_account.gl_account_id,
        )
    except (InvalidStaffPostingError, StaffOverpaymentError, ValueError) as exc:
        raise InvalidClassificationError(str(exc)) from exc
    journal_id = result.journal_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.STAFF_PAYMENT,
        journal_id,
        match_token=ctx.match_token,
        links={
            "employee_id": ctx.employee_id,
        },
    )


def _post_staff_incentive(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    incentive_amount = abs(ctx.line.amount_kurus)
    assert ctx.actor_id is not None
    assert ctx.employee_id is not None
    try:
        result = staff_posting.post_incentive_paid(
            ctx.session,
            ctx.entity_id,
            ctx.employee_id,
            payment_date=ctx.line.transaction_date,
            amount_minor=incentive_amount,
            description=ctx.line.description,
            actor_id=ctx.actor_id,
            payment_account_id=ctx.money_account.gl_account_id,
        )
    except (InvalidStaffPostingError, ValueError) as exc:
        raise InvalidClassificationError(str(exc)) from exc
    journal_id = result.journal_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.STAFF_INCENTIVE,
        journal_id,
        match_token=ctx.match_token,
        links={
            "employee_id": ctx.employee_id,
        },
    )


def _post_staff_advance(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    advance_amount = abs(ctx.line.amount_kurus)
    assert ctx.actor_id is not None
    assert ctx.employee_id is not None
    try:
        result = staff_posting.post_advance_paid(
            ctx.session,
            ctx.entity_id,
            ctx.employee_id,
            payment_date=ctx.line.transaction_date,
            amount_minor=advance_amount,
            description=ctx.line.description,
            actor_id=ctx.actor_id,
            payment_account_id=ctx.money_account.gl_account_id,
        )
    except (InvalidStaffPostingError, ValueError) as exc:
        raise InvalidClassificationError(str(exc)) from exc
    journal_id = result.journal_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.STAFF_ADVANCE,
        journal_id,
        match_token=ctx.match_token,
        links={
            "employee_id": ctx.employee_id,
        },
    )
