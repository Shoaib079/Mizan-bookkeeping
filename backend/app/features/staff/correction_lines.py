"""Rebuilding a staff movement's GL lines when it is corrected.

One branch per movement type, in TRY and in FX. It lived in the service, where
it was the longest thing in the file and had nothing to do with the HTTP
shapes around it — the same move `features/partners/correction_lines.py`
already made, for the same reason.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.ledger.correction import CorrectionNotFoundError
from app.core.ledger.posting import PostingLine
from app.core.staff import posting as staff_posting
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.types import PayCurrency, StaffMovementType
from app.features.staff.schema import StaffJournalEntryCorrect


def build_staff_correction_lines(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    staff_row: StaffLedgerEntry,
    payload: StaffJournalEntryCorrect,
) -> tuple[list[PostingLine], int, int | None]:
    from app.core.chart_of_accounts.default_chart import (
        EMPLOYEE_ADVANCES_CODE,
        SALARIES_PAYABLE_CODE,
        SALARY_EXPENSE_CODE,
    )
    from app.core.chart_of_accounts.types import AccountNormalBalance

    employee = staff_posting._get_employee(session, entity_id, employee_id)
    movement_type = staff_row.movement_type
    if payload.extra_days is not None and payload.per_day_minor is not None:
        # Days × rate wins for extra-days rows so amount and metadata agree.
        amount_minor = payload.extra_days * payload.per_day_minor
    else:
        amount_minor = (
            payload.amount_minor
            if payload.amount_minor is not None
            else abs(staff_row.amount_minor)
        )
    try_cost = (
        payload.try_cost_kurus
        if payload.try_cost_kurus is not None
        else staff_row.try_cost_kurus
    )

    if movement_type == StaffMovementType.SALARY_ACCRUED:
        if employee.pay_currency != PayCurrency.TRY:
            raise ValueError("FX salary accrual has no GL entry to correct")
        salary_expense = staff_posting._chart_account(session, SALARY_EXPENSE_CODE)
        salaries_payable = staff_posting._chart_account(session, SALARIES_PAYABLE_CODE)
        lines = staff_posting.build_try_salary_accrual_lines(
            salary_expense_id=salary_expense.id,
            salaries_payable_id=salaries_payable.id,
            amount_kurus=amount_minor,
        )
        return lines, amount_minor, None

    if movement_type == StaffMovementType.EXTRA_DAYS_ACCRUED:
        # Accrue-only extra days: Dr salary expense / Cr salaries payable, same
        # shape as a salary accrual. Amount is days × per-day when both given.
        if employee.pay_currency != PayCurrency.TRY:
            raise ValueError("FX extra days accrual has no GL entry to correct")
        salary_expense = staff_posting._chart_account(session, SALARY_EXPENSE_CODE)
        salaries_payable = staff_posting._chart_account(session, SALARIES_PAYABLE_CODE)
        lines = staff_posting.build_try_salary_accrual_lines(
            salary_expense_id=salary_expense.id,
            salaries_payable_id=salaries_payable.id,
            amount_kurus=amount_minor,
        )
        return lines, amount_minor, None

    if movement_type == StaffMovementType.EXTRA_DAYS_PAID:
        # Extra days paid straight from cash: Dr salary expense / Cr cash.
        if employee.pay_currency != PayCurrency.TRY:
            raise ValueError("FX extra days payment is not correctable")
        if payload.payment_account_id is None:
            raise ValueError("payment_account_id required for extra days correction")
        payment_gl = staff_posting._validate_try_payment_account(
            session, entity_id, payload.payment_account_id
        )
        salary_expense = staff_posting._chart_account(session, SALARY_EXPENSE_CODE)
        lines = [
            PostingLine(
                account_id=salary_expense.id,
                amount_kurus=amount_minor,
                side=AccountNormalBalance.DEBIT,
            ),
            PostingLine(
                account_id=payment_gl.id,
                amount_kurus=amount_minor,
                side=AccountNormalBalance.CREDIT,
            ),
        ]
        return lines, -amount_minor, None

    if movement_type == StaffMovementType.ADVANCE_PAID:
        advances = staff_posting._chart_account(session, EMPLOYEE_ADVANCES_CODE)
        if employee.pay_currency == PayCurrency.TRY:
            if payload.payment_account_id is None:
                raise ValueError("payment_account_id required for TRY advance correction")
            payment_gl = staff_posting._validate_try_payment_account(
                session, entity_id, payload.payment_account_id
            )
            lines = staff_posting.build_try_advance_lines(
                employee_advances_id=advances.id,
                payment_account_id=payment_gl.id,
                amount_kurus=amount_minor,
            )
            return lines, -amount_minor, None

        if payload.fx_money_account_id is None or try_cost is None:
            raise ValueError(
                "fx_money_account_id and try_cost_kurus required for FX advance correction"
            )
        _, fx_gl = staff_posting._validate_fx_money_account(
            session, entity_id, payload.fx_money_account_id, employee.pay_currency
        )
        lines = staff_posting.build_fx_advance_lines(
            employee_advances_id=advances.id,
            fx_gl_account_id=fx_gl.id,
            try_cost_kurus=try_cost,
        )
        return lines, -amount_minor, try_cost

    if movement_type == StaffMovementType.SALARY_PAYMENT:
        sibling = session.scalar(
            select(StaffLedgerEntry).where(
                StaffLedgerEntry.journal_entry_id == staff_row.journal_entry_id,
                StaffLedgerEntry.movement_type == StaffMovementType.ADVANCE_APPLIED,
            )
        )
        if sibling is not None:
            # Payments auto-apply advances when cash is below total owed
            # (owner decision 2026-07-13). A paired payment+advance-applied
            # can't be partially rewritten — voiding reverses both together.
            raise ValueError(
                "This payment also applied an advance. Void it instead — the "
                "void reverses both entries together and restores the advance "
                "— then re-record the payment."
            )

        if employee.pay_currency == PayCurrency.TRY:
            if payload.payment_account_id is None:
                raise ValueError("payment_account_id required for TRY payment correction")
            payment_gl = staff_posting._validate_try_payment_account(
                session, entity_id, payload.payment_account_id
            )
            salaries_payable = staff_posting._chart_account(session, SALARIES_PAYABLE_CODE)
            advances = staff_posting._chart_account(session, EMPLOYEE_ADVANCES_CODE)
            payable_cleared = amount_minor
            lines = staff_posting.build_try_salary_payment_lines(
                salaries_payable_id=salaries_payable.id,
                employee_advances_id=advances.id,
                payment_account_id=payment_gl.id,
                payable_cleared_kurus=payable_cleared,
                advance_applied_kurus=0,
                cash_paid_kurus=amount_minor,
            )
            return lines, -payable_cleared, None

        if payload.fx_money_account_id is None or try_cost is None:
            raise ValueError(
                "fx_money_account_id and try_cost_kurus required for FX payment correction"
            )
        salary_expense = staff_posting._chart_account(session, SALARY_EXPENSE_CODE)
        advances = staff_posting._chart_account(session, EMPLOYEE_ADVANCES_CODE)
        _, fx_gl = staff_posting._validate_fx_money_account(
            session, entity_id, payload.fx_money_account_id, employee.pay_currency
        )
        lines = staff_posting.build_fx_salary_payment_lines(
            salary_expense_id=salary_expense.id,
            employee_advances_id=advances.id,
            fx_gl_account_id=fx_gl.id,
            expense_try_kurus=try_cost,
            advance_applied_try_kurus=0,
            fx_paid_try_kurus=try_cost,
        )
        return lines, -amount_minor, try_cost

    raise CorrectionNotFoundError("staff movement type is not correctable")
