"""Staff salary / advance / payment GL posting (Decisions §16)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import (
    EMPLOYEE_ADVANCES_CODE,
    SALARIES_PAYABLE_CODE,
    SALARY_EXPENSE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.fx.ledger import record_fx_movement
from app.core.fx.models import FxLedgerEntry
from app.core.fx.types import FxMovementType
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.core.staff import ledger as staff_ledger
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.types import PayCurrency, StaffMovementType
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import (
    FX_BUCKET_CODE_BY_CURRENCY,
    MoneyAccount,
    MoneyAccountKind,
)
from app.features.entities import service as entity_service
from app.features.staff.models import Employee


class InvalidStaffPostingError(ValueError):
    """Staff posting preconditions failed."""


@dataclass(frozen=True, slots=True)
class StaffAccrualPostResult:
    journal_entry: JournalEntry | None
    staff_ledger_entry: StaffLedgerEntry
    balance_minor: int


@dataclass(frozen=True, slots=True)
class StaffAdvancePostResult:
    journal_entry: JournalEntry
    staff_ledger_entry: StaffLedgerEntry
    balance_minor: int
    fx_ledger_entry: FxLedgerEntry | None = None


@dataclass(frozen=True, slots=True)
class StaffPaymentPostResult:
    journal_entry: JournalEntry
    staff_ledger_entry: StaffLedgerEntry
    balance_minor: int
    advance_applied_minor: int = 0
    fx_ledger_entry: FxLedgerEntry | None = None


def _get_employee(session: Session, entity_id: uuid.UUID, employee_id: uuid.UUID) -> Employee:
    employee = session.get(Employee, employee_id)
    if employee is None or employee.entity_id != entity_id:
        raise LookupError("Employee not found")
    return employee


def _chart_account(session: Session, code: str) -> Account:
    account = session.scalar(select(Account).where(Account.code == code))
    if account is None:
        raise InvalidAccountError(f"chart account {code} not found")
    if not account.is_active:
        raise InvalidAccountError(f"account {code} is not active")
    return account


def _validate_try_payment_account(
    session: Session, entity_id: uuid.UUID, account_id: uuid.UUID
) -> Account:
    account = session.get(Account, account_id)
    if account is None or account.entity_id != entity_id:
        raise InvalidAccountError("payment account not found for this entity")
    if not account.is_active:
        raise InvalidAccountError(f"account {account.code} is not active")
    if account.account_type != AccountType.ASSET:
        raise InvalidAccountError(
            f"account {account.code} is not an asset (bank/cash) account"
        )
    return account


def _validate_fx_money_account(
    session: Session,
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    expected_currency: PayCurrency,
) -> tuple[MoneyAccount, Account]:
    money_account = session.get(MoneyAccount, money_account_id)
    if money_account is None or money_account.entity_id != entity_id:
        raise InvalidStaffPostingError("FX money account not found for this entity")
    if not money_account.is_active:
        raise InvalidStaffPostingError("FX money account is not active")
    if money_account.account_kind != MoneyAccountKind.FOREIGN_CURRENCY:
        raise InvalidStaffPostingError("money account must be a foreign currency wallet")
    if money_account.currency != expected_currency.value:
        raise InvalidStaffPostingError(
            f"FX wallet currency {money_account.currency} does not match employee pay currency"
        )

    gl_account = session.get(Account, money_account.gl_account_id)
    if gl_account is None or not gl_account.is_active:
        raise InvalidAccountError("FX GL account not found or inactive")

    expected_bucket = FX_BUCKET_CODE_BY_CURRENCY.get(money_account.currency)
    bucket = (
        session.get(Account, gl_account.parent_account_id)
        if gl_account.parent_account_id
        else None
    )
    if bucket is None or bucket.code != expected_bucket:
        raise InvalidStaffPostingError(
            f"FX wallet must map to chart bucket {expected_bucket}"
        )

    return money_account, gl_account


def build_try_salary_accrual_lines(
    *,
    salary_expense_id: uuid.UUID,
    salaries_payable_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    if amount_kurus <= 0:
        raise ValueError("accrual amount must be positive kuruş")

    return [
        PostingLine(
            account_id=salary_expense_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=salaries_payable_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_try_advance_lines(
    *,
    employee_advances_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    if amount_kurus <= 0:
        raise ValueError("advance amount must be positive kuruş")

    return [
        PostingLine(
            account_id=employee_advances_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=payment_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_try_salary_payment_lines(
    *,
    salaries_payable_id: uuid.UUID,
    employee_advances_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    payable_cleared_kurus: int,
    advance_applied_kurus: int,
    cash_paid_kurus: int,
) -> list[PostingLine]:
    if cash_paid_kurus <= 0:
        raise ValueError("cash payment must be positive kuruş")
    if payable_cleared_kurus != advance_applied_kurus + cash_paid_kurus:
        raise ValueError("payable cleared must equal advance applied plus cash paid")

    lines: list[PostingLine] = [
        PostingLine(
            account_id=salaries_payable_id,
            amount_kurus=payable_cleared_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
    ]
    if advance_applied_kurus > 0:
        lines.append(
            PostingLine(
                account_id=employee_advances_id,
                amount_kurus=advance_applied_kurus,
                side=AccountNormalBalance.CREDIT,
            )
        )
    lines.append(
        PostingLine(
            account_id=payment_account_id,
            amount_kurus=cash_paid_kurus,
            side=AccountNormalBalance.CREDIT,
        )
    )
    return lines


def build_fx_advance_lines(
    *,
    employee_advances_id: uuid.UUID,
    fx_gl_account_id: uuid.UUID,
    try_cost_kurus: int,
) -> list[PostingLine]:
    if try_cost_kurus <= 0:
        raise ValueError("try_cost_kurus must be positive")

    return [
        PostingLine(
            account_id=employee_advances_id,
            amount_kurus=try_cost_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=fx_gl_account_id,
            amount_kurus=try_cost_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_fx_salary_payment_lines(
    *,
    salary_expense_id: uuid.UUID,
    employee_advances_id: uuid.UUID,
    fx_gl_account_id: uuid.UUID,
    expense_try_kurus: int,
    advance_applied_try_kurus: int,
    fx_paid_try_kurus: int,
) -> list[PostingLine]:
    if fx_paid_try_kurus <= 0:
        raise ValueError("FX payment try_cost_kurus must be positive")
    if expense_try_kurus != advance_applied_try_kurus + fx_paid_try_kurus:
        raise ValueError("expense must equal advance applied plus FX paid")

    lines: list[PostingLine] = [
        PostingLine(
            account_id=salary_expense_id,
            amount_kurus=expense_try_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
    ]
    if advance_applied_try_kurus > 0:
        lines.append(
            PostingLine(
                account_id=employee_advances_id,
                amount_kurus=advance_applied_try_kurus,
                side=AccountNormalBalance.CREDIT,
            )
        )
    lines.append(
        PostingLine(
            account_id=fx_gl_account_id,
            amount_kurus=fx_paid_try_kurus,
            side=AccountNormalBalance.CREDIT,
        )
    )
    return lines


def post_salary_accrual(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    *,
    accrual_date: date,
    amount_minor: int,
    description: str,
    actor_id: uuid.UUID,
    period_year: int,
    period_month: int,
) -> StaffAccrualPostResult:
    """Accrue salary — TRY posts Dr 5100 / Cr 2250; FX subledger-only until payment."""
    if amount_minor <= 0:
        raise ValueError("Accrual amount_minor must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        employee = _get_employee(session, entity_id, employee_id)

        journal_entry: JournalEntry | None = None
        if employee.pay_currency == PayCurrency.TRY:
            salary_expense = _chart_account(session, SALARY_EXPENSE_CODE)
            salaries_payable = _chart_account(session, SALARIES_PAYABLE_CODE)
            lines = build_try_salary_accrual_lines(
                salary_expense_id=salary_expense.id,
                salaries_payable_id=salaries_payable.id,
                amount_kurus=amount_minor,
            )
            journal_entry = prepare_journal_entry(
                session,
                entity_id,
                accrual_date,
                description,
                lines,
                actor_id=actor_id,
                source=JournalEntrySource.STAFF_ACCRUAL,
            )

        staff_entry = staff_ledger.persist_staff_ledger_entry(
            session,
            employee_id,
            movement_date=accrual_date,
            movement_type=StaffMovementType.SALARY_ACCRUED,
            amount_minor=amount_minor,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id if journal_entry else None,
            period_year=period_year,
            period_month=period_month,
        )

        session.commit()
        if journal_entry:
            session.refresh(journal_entry)
            _ = list(journal_entry.lines)
        session.refresh(staff_entry)

        balance = session.scalar(
            select(func.coalesce(func.sum(StaffLedgerEntry.amount_minor), 0)).where(
                StaffLedgerEntry.employee_id == employee_id
            )
        )
        return StaffAccrualPostResult(
            journal_entry=journal_entry,
            staff_ledger_entry=staff_entry,
            balance_minor=int(balance or 0),
        )


def post_advance_paid(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    *,
    payment_date: date,
    amount_minor: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID | None = None,
    fx_money_account_id: uuid.UUID | None = None,
    try_cost_kurus: int | None = None,
) -> StaffAdvancePostResult:
    """Pay salary advance — Dr 1300 / Cr cash or FX wallet; subledger negative."""
    if amount_minor <= 0:
        raise ValueError("Advance amount_minor must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        employee = _get_employee(session, entity_id, employee_id)
        advances = _chart_account(session, EMPLOYEE_ADVANCES_CODE)

        fx_entry: FxLedgerEntry | None = None
        journal_entry: JournalEntry

        if employee.pay_currency == PayCurrency.TRY:
            if payment_account_id is None:
                raise InvalidStaffPostingError("payment_account_id required for TRY advance")
            payment_gl = _validate_try_payment_account(session, entity_id, payment_account_id)
            lines = build_try_advance_lines(
                employee_advances_id=advances.id,
                payment_account_id=payment_gl.id,
                amount_kurus=amount_minor,
            )
            journal_entry = prepare_journal_entry(
                session,
                entity_id,
                payment_date,
                description,
                lines,
                actor_id=actor_id,
                source=JournalEntrySource.STAFF_ADVANCE,
            )
            stored_try_cost: int | None = None
        else:
            if fx_money_account_id is None or try_cost_kurus is None:
                raise InvalidStaffPostingError(
                    "fx_money_account_id and try_cost_kurus required for FX advance"
                )
            if try_cost_kurus <= 0:
                raise ValueError("try_cost_kurus must be positive")

            _, fx_gl = _validate_fx_money_account(
                session, entity_id, fx_money_account_id, employee.pay_currency
            )
            lines = build_fx_advance_lines(
                employee_advances_id=advances.id,
                fx_gl_account_id=fx_gl.id,
                try_cost_kurus=try_cost_kurus,
            )
            journal_entry = prepare_journal_entry(
                session,
                entity_id,
                payment_date,
                description,
                lines,
                actor_id=actor_id,
                source=JournalEntrySource.STAFF_ADVANCE,
            )
            fx_entry = record_fx_movement(
                session,
                fx_money_account_id,
                movement_date=payment_date,
                movement_type=FxMovementType.SPEND,
                native_quantity=-amount_minor,
                try_cost_kurus=-try_cost_kurus,
                description=description,
                actor_id=actor_id,
                journal_entry_id=journal_entry.id,
            )
            stored_try_cost = try_cost_kurus

        staff_entry = staff_ledger.persist_staff_ledger_entry(
            session,
            employee_id,
            movement_date=payment_date,
            movement_type=StaffMovementType.ADVANCE_PAID,
            amount_minor=-amount_minor,
            try_cost_kurus=stored_try_cost,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(staff_entry)
        if fx_entry:
            session.refresh(fx_entry)
        _ = list(journal_entry.lines)

        balance = session.scalar(
            select(func.coalesce(func.sum(StaffLedgerEntry.amount_minor), 0)).where(
                StaffLedgerEntry.employee_id == employee_id
            )
        )
        return StaffAdvancePostResult(
            journal_entry=journal_entry,
            staff_ledger_entry=staff_entry,
            balance_minor=int(balance or 0),
            fx_ledger_entry=fx_entry,
        )


def post_salary_payment(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    *,
    payment_date: date,
    amount_minor: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID | None = None,
    fx_money_account_id: uuid.UUID | None = None,
    try_cost_kurus: int | None = None,
    period_year: int | None = None,
    period_month: int | None = None,
) -> StaffPaymentPostResult:
    """Settle salary — no second expense for TRY; FX expense at payment via try_cost_kurus."""
    if amount_minor <= 0:
        raise ValueError("Payment amount_minor must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        employee = _get_employee(session, entity_id, employee_id)

        current = staff_ledger.current_balance_minor(session, entity_id, employee_id)
        if current - amount_minor < 0:
            raise staff_ledger.OverpaymentError(
                f"Payment of {amount_minor} exceeds staff balance of {current}"
            )

        remaining = staff_ledger.remaining_accrual_minor(session, employee_id)
        advance_minor = staff_ledger.outstanding_advance_minor(session, employee_id)
        advance_applied_minor = min(advance_minor, remaining - amount_minor)

        fx_entry: FxLedgerEntry | None = None
        journal_entry: JournalEntry
        advance_applied_try = 0

        if employee.pay_currency == PayCurrency.TRY:
            if payment_account_id is None:
                raise InvalidStaffPostingError("payment_account_id required for TRY payment")
            payment_gl = _validate_try_payment_account(session, entity_id, payment_account_id)
            salaries_payable = _chart_account(session, SALARIES_PAYABLE_CODE)
            advances = _chart_account(session, EMPLOYEE_ADVANCES_CODE)

            payable_cleared = amount_minor + advance_applied_minor
            lines = build_try_salary_payment_lines(
                salaries_payable_id=salaries_payable.id,
                employee_advances_id=advances.id,
                payment_account_id=payment_gl.id,
                payable_cleared_kurus=payable_cleared,
                advance_applied_kurus=advance_applied_minor,
                cash_paid_kurus=amount_minor,
            )
            journal_entry = prepare_journal_entry(
                session,
                entity_id,
                payment_date,
                description,
                lines,
                actor_id=actor_id,
                source=JournalEntrySource.STAFF_PAYMENT,
            )
            stored_try_cost = None
            payable_cleared_minor = amount_minor + advance_applied_minor
        else:
            if fx_money_account_id is None or try_cost_kurus is None:
                raise InvalidStaffPostingError(
                    "fx_money_account_id and try_cost_kurus required for FX payment"
                )
            if try_cost_kurus <= 0:
                raise ValueError("try_cost_kurus must be positive")

            salary_expense = _chart_account(session, SALARY_EXPENSE_CODE)
            advances = _chart_account(session, EMPLOYEE_ADVANCES_CODE)
            _, fx_gl = _validate_fx_money_account(
                session, entity_id, fx_money_account_id, employee.pay_currency
            )

            advance_try = staff_ledger.outstanding_advance_try_kurus(session, employee_id)
            advance_applied_try = advance_try if advance_applied_minor > 0 else 0

            expense_try = try_cost_kurus + advance_applied_try
            lines = build_fx_salary_payment_lines(
                salary_expense_id=salary_expense.id,
                employee_advances_id=advances.id,
                fx_gl_account_id=fx_gl.id,
                expense_try_kurus=expense_try,
                advance_applied_try_kurus=advance_applied_try,
                fx_paid_try_kurus=try_cost_kurus,
            )
            journal_entry = prepare_journal_entry(
                session,
                entity_id,
                payment_date,
                description,
                lines,
                actor_id=actor_id,
                source=JournalEntrySource.STAFF_PAYMENT,
            )
            fx_entry = record_fx_movement(
                session,
                fx_money_account_id,
                movement_date=payment_date,
                movement_type=FxMovementType.SPEND,
                native_quantity=-amount_minor,
                try_cost_kurus=-try_cost_kurus,
                description=description,
                actor_id=actor_id,
                journal_entry_id=journal_entry.id,
            )
            stored_try_cost = try_cost_kurus
            payable_cleared_minor = amount_minor + advance_applied_minor

        staff_entry = staff_ledger.persist_staff_ledger_entry(
            session,
            employee_id,
            movement_date=payment_date,
            movement_type=StaffMovementType.SALARY_PAYMENT,
            amount_minor=-payable_cleared_minor,
            try_cost_kurus=stored_try_cost,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
            period_year=period_year,
            period_month=period_month,
        )

        if advance_applied_minor > 0:
            applied_try_cost = (
                advance_applied_try if employee.pay_currency != PayCurrency.TRY else None
            )
            staff_ledger.persist_staff_ledger_entry(
                session,
                employee_id,
                movement_date=payment_date,
                movement_type=StaffMovementType.ADVANCE_APPLIED,
                amount_minor=advance_applied_minor,
                try_cost_kurus=applied_try_cost,
                description=f"{description} — advance applied",
                actor_id=actor_id,
                journal_entry_id=journal_entry.id,
                period_year=period_year,
                period_month=period_month,
            )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(staff_entry)
        if fx_entry:
            session.refresh(fx_entry)
        _ = list(journal_entry.lines)

        balance = session.scalar(
            select(func.coalesce(func.sum(StaffLedgerEntry.amount_minor), 0)).where(
                StaffLedgerEntry.employee_id == employee_id
            )
        )
        return StaffPaymentPostResult(
            journal_entry=journal_entry,
            staff_ledger_entry=staff_entry,
            balance_minor=int(balance or 0),
            advance_applied_minor=advance_applied_minor,
            fx_ledger_entry=fx_entry,
        )


def build_try_combined_salary_and_excess_advance_lines(
    *,
    salaries_payable_id: uuid.UUID,
    employee_advances_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    payable_cleared_kurus: int,
    advance_applied_kurus: int,
    salary_cash_kurus: int,
    excess_advance_kurus: int,
) -> list[PostingLine]:
    """One bank outflow may settle salary payable and/or record excess as advance."""
    cash_total = salary_cash_kurus + excess_advance_kurus
    if cash_total <= 0:
        raise ValueError("cash outflow must be positive")

    lines: list[PostingLine] = []
    if payable_cleared_kurus > 0:
        lines.append(
            PostingLine(
                account_id=salaries_payable_id,
                amount_kurus=payable_cleared_kurus,
                side=AccountNormalBalance.DEBIT,
            )
        )
    if advance_applied_kurus > 0:
        lines.append(
            PostingLine(
                account_id=employee_advances_id,
                amount_kurus=advance_applied_kurus,
                side=AccountNormalBalance.CREDIT,
            )
        )
    if excess_advance_kurus > 0:
        lines.append(
            PostingLine(
                account_id=employee_advances_id,
                amount_kurus=excess_advance_kurus,
                side=AccountNormalBalance.DEBIT,
            )
        )
    lines.append(
        PostingLine(
            account_id=payment_account_id,
            amount_kurus=cash_total,
            side=AccountNormalBalance.CREDIT,
        )
    )
    return lines


def build_try_incentive_lines(
    *,
    salary_expense_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    if amount_kurus <= 0:
        raise ValueError("incentive amount must be positive kuruş")
    return [
        PostingLine(
            account_id=salary_expense_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=payment_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def _ensure_period_accrual_up_to(
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
    current = staff_ledger.period_accrued_minor(
        session, employee_id, period_year=period_year, period_month=period_month
    )
    if period_salary_minor < current:
        raise InvalidStaffPostingError(
            f"Salary for {period_month:02d}/{period_year} is already accrued at "
            f"{current} minor units — correct the accrual to lower it."
        )
    delta = period_salary_minor - current
    if delta <= 0:
        return
    post_salary_accrual(
        session,
        entity_id,
        employee_id,
        accrual_date=accrual_date,
        amount_minor=delta,
        description=f"Salary {period_year}-{period_month:02d}",
        actor_id=actor_id,
        period_year=period_year,
        period_month=period_month,
    )


def post_period_salary_payment(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    *,
    payment_date: date,
    cash_minor: int,
    period_year: int,
    period_month: int,
    period_salary_minor: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID | None = None,
    fx_money_account_id: uuid.UUID | None = None,
    try_cost_kurus: int | None = None,
) -> StaffPaymentPostResult:
    """Accrue-at-pay salary for one month — partial pay, prior months, excess → advance."""
    if cash_minor <= 0:
        raise ValueError("cash_minor must be positive")
    if period_salary_minor <= 0:
        raise ValueError("period_salary_minor must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        employee = _get_employee(session, entity_id, employee_id)

        if employee.pay_currency != PayCurrency.TRY:
            _ensure_period_accrual_up_to(
                session,
                entity_id,
                employee_id,
                accrual_date=payment_date,
                period_year=period_year,
                period_month=period_month,
                period_salary_minor=period_salary_minor,
                actor_id=actor_id,
            )
            return post_salary_payment(
                session,
                entity_id,
                employee_id,
                payment_date=payment_date,
                amount_minor=cash_minor,
                description=description,
                actor_id=actor_id,
                payment_account_id=payment_account_id,
                fx_money_account_id=fx_money_account_id,
                try_cost_kurus=try_cost_kurus,
                period_year=period_year,
                period_month=period_month,
            )

        if payment_account_id is None:
            raise InvalidStaffPostingError("payment_account_id required for TRY payment")

        _ensure_period_accrual_up_to(
            session,
            entity_id,
            employee_id,
            accrual_date=payment_date,
            period_year=period_year,
            period_month=period_month,
            period_salary_minor=period_salary_minor,
            actor_id=actor_id,
        )

        period_remaining = staff_ledger.period_remaining_minor(
            session,
            employee_id,
            period_year=period_year,
            period_month=period_month,
            period_salary_minor=period_salary_minor,
        )
        advance_minor = staff_ledger.outstanding_advance_minor(session, employee_id)
        advance_applied_minor = (
            min(advance_minor, period_remaining) if period_remaining > 0 else 0
        )
        salary_cash_minor = min(
            cash_minor, max(0, period_remaining - advance_applied_minor)
        )
        excess_advance_minor = cash_minor - salary_cash_minor
        payable_cleared = salary_cash_minor + advance_applied_minor

        payment_gl = _validate_try_payment_account(session, entity_id, payment_account_id)
        salaries_payable = _chart_account(session, SALARIES_PAYABLE_CODE)
        advances = _chart_account(session, EMPLOYEE_ADVANCES_CODE)

        if payable_cleared > 0 or excess_advance_minor > 0:
            lines = build_try_combined_salary_and_excess_advance_lines(
                salaries_payable_id=salaries_payable.id,
                employee_advances_id=advances.id,
                payment_account_id=payment_gl.id,
                payable_cleared_kurus=payable_cleared,
                advance_applied_kurus=advance_applied_minor,
                salary_cash_kurus=salary_cash_minor,
                excess_advance_kurus=excess_advance_minor,
            )
            journal_entry = prepare_journal_entry(
                session,
                entity_id,
                payment_date,
                description,
                lines,
                actor_id=actor_id,
                source=JournalEntrySource.STAFF_PAYMENT,
            )
        else:
            raise InvalidStaffPostingError("Nothing to post for this salary payment")

        staff_entry: StaffLedgerEntry | None = None
        if payable_cleared > 0:
            staff_entry = staff_ledger.persist_staff_ledger_entry(
                session,
                employee_id,
                movement_date=payment_date,
                movement_type=StaffMovementType.SALARY_PAYMENT,
                amount_minor=-payable_cleared,
                description=description,
                actor_id=actor_id,
                journal_entry_id=journal_entry.id,
                period_year=period_year,
                period_month=period_month,
            )
            if advance_applied_minor > 0:
                staff_ledger.persist_staff_ledger_entry(
                    session,
                    employee_id,
                    movement_date=payment_date,
                    movement_type=StaffMovementType.ADVANCE_APPLIED,
                    amount_minor=advance_applied_minor,
                    description=f"{description} — advance applied",
                    actor_id=actor_id,
                    journal_entry_id=journal_entry.id,
                    period_year=period_year,
                    period_month=period_month,
                )

        if excess_advance_minor > 0:
            staff_ledger.persist_staff_ledger_entry(
                session,
                employee_id,
                movement_date=payment_date,
                movement_type=StaffMovementType.ADVANCE_PAID,
                amount_minor=-excess_advance_minor,
                description=f"{description} — excess as advance",
                actor_id=actor_id,
                journal_entry_id=journal_entry.id,
                period_year=period_year,
                period_month=period_month,
            )

        session.commit()
        session.refresh(journal_entry)
        if staff_entry:
            session.refresh(staff_entry)
        _ = list(journal_entry.lines)

        balance = session.scalar(
            select(func.coalesce(func.sum(StaffLedgerEntry.amount_minor), 0)).where(
                StaffLedgerEntry.employee_id == employee_id
            )
        )
        primary_entry = staff_entry or session.scalar(
            select(StaffLedgerEntry).where(
                StaffLedgerEntry.journal_entry_id == journal_entry.id,
                StaffLedgerEntry.movement_type == StaffMovementType.ADVANCE_PAID,
            )
        )
        assert primary_entry is not None
        return StaffPaymentPostResult(
            journal_entry=journal_entry,
            staff_ledger_entry=primary_entry,
            balance_minor=int(balance or 0),
            advance_applied_minor=advance_applied_minor,
        )


def post_incentive_paid(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    *,
    payment_date: date,
    amount_minor: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
) -> StaffAdvancePostResult:
    """Company-covered staff expense / incentive — Dr 5100 / Cr cash (no salary payable)."""
    if amount_minor <= 0:
        raise ValueError("Incentive amount_minor must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_employee(session, entity_id, employee_id)
        payment_gl = _validate_try_payment_account(session, entity_id, payment_account_id)
        salary_expense = _chart_account(session, SALARY_EXPENSE_CODE)
        lines = build_try_incentive_lines(
            salary_expense_id=salary_expense.id,
            payment_account_id=payment_gl.id,
            amount_kurus=amount_minor,
        )
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            payment_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.STAFF_PAYMENT,
        )
        staff_entry = staff_ledger.persist_staff_ledger_entry(
            session,
            employee_id,
            movement_date=payment_date,
            movement_type=StaffMovementType.INCENTIVE_PAID,
            amount_minor=-amount_minor,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )
        session.commit()
        session.refresh(journal_entry)
        session.refresh(staff_entry)
        _ = list(journal_entry.lines)
        balance = session.scalar(
            select(func.coalesce(func.sum(StaffLedgerEntry.amount_minor), 0)).where(
                StaffLedgerEntry.employee_id == employee_id
            )
        )
        return StaffAdvancePostResult(
            journal_entry=journal_entry,
            staff_ledger_entry=staff_entry,
            balance_minor=int(balance or 0),
        )
