"""Partner-funded staff salary — Dr 2250 / Cr 2150 (+ advance offset).

Accrual stays on the normal staff path (Dr 5100 / Cr 2250 once). This module
only posts the *payment* when a partner pays from pocket: no cash/bank lines,
one journal, staff + partner subledger rows together.

Void reverses GL + every staff row + the partner row atomically — never void
one leg alone (HARDENING Class 2).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import (
    EMPLOYEE_ADVANCES_CODE,
    PARTNER_REIMBURSEMENT_PAYABLE_CODE,
    SALARIES_PAYABLE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.correction.machinery import (
    SubledgerVoidResult,
    _append_partner_reversal,
    _append_staff_reversal,
    void_gl_with_subledger_rows,
)
from app.core.ledger.correction.registry import CorrectionNotFoundError
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.core.partners import ledger as partner_ledger
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.core.staff import ledger as staff_ledger
from app.core.staff import posting as staff_posting
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.types import PayCurrency, StaffMovementType
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.partners.models import Partner
from app.features.staff.models import Employee


class InvalidPartnerFundedSalaryError(ValueError):
    """Partner-funded salary preconditions failed."""


@dataclass(frozen=True, slots=True)
class PartnerFundedSalaryPostResult:
    journal_entry: JournalEntry
    staff_ledger_entry: StaffLedgerEntry
    partner_ledger_entry: PartnerLedgerEntry
    balance_minor: int
    partner_balance_kurus: int
    advance_applied_minor: int = 0


def build_partner_funded_salary_lines(
    *,
    salaries_payable_id: uuid.UUID,
    employee_advances_id: uuid.UUID,
    partner_payable_id: uuid.UUID,
    payable_cleared_kurus: int,
    advance_applied_kurus: int,
    partner_credit_kurus: int,
    excess_advance_kurus: int,
) -> list[PostingLine]:
    """Same shape as cash salary pay, but Cr 2150 instead of cash/bank."""
    if partner_credit_kurus <= 0:
        raise ValueError("partner credit must be positive")
    if partner_credit_kurus != (
        (payable_cleared_kurus - advance_applied_kurus) + excess_advance_kurus
    ):
        # salary_portion + excess == partner_credit; salary_portion =
        # payable_cleared - advance_applied
        raise ValueError("partner credit does not match cleared + excess")

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
            account_id=partner_payable_id,
            amount_kurus=partner_credit_kurus,
            side=AccountNormalBalance.CREDIT,
        )
    )
    return lines


def _chart_account(session: Session, code: str) -> Account:
    account = session.scalar(select(Account).where(Account.code == code))
    if account is None:
        raise InvalidAccountError(f"chart account {code} not found")
    if not account.is_active:
        raise InvalidAccountError(f"account {code} is not active")
    return account


def _get_employee(session: Session, entity_id: uuid.UUID, employee_id: uuid.UUID) -> Employee:
    employee = session.get(Employee, employee_id)
    if employee is None or employee.entity_id != entity_id:
        raise LookupError("Employee not found")
    return employee


def _get_partner(session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID) -> Partner:
    partner = session.get(Partner, partner_id)
    if partner is None or partner.entity_id != entity_id:
        raise LookupError("Partner not found")
    return partner


def post_partner_funded_period_salary(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    payment_date: date,
    amount_minor: int,
    period_year: int,
    period_month: int,
    period_salary_minor: int,
    description: str,
    actor_id: uuid.UUID,
    extra_days: int | None = None,
    per_day_minor: int | None = None,
) -> PartnerFundedSalaryPostResult:
    """TRY salary paid by a partner from pocket — company owes partner on 2150."""
    if amount_minor <= 0:
        raise InvalidPartnerFundedSalaryError(
            "amount_minor must be positive for partner-funded salary"
        )
    if period_salary_minor <= 0:
        raise InvalidPartnerFundedSalaryError("period_salary_minor must be positive")
    if (extra_days is None) ^ (per_day_minor is None):
        raise InvalidPartnerFundedSalaryError(
            "extra_days and per_day_minor must be sent together"
        )
    if extra_days is not None and (extra_days <= 0 or extra_days > 31):
        raise InvalidPartnerFundedSalaryError("extra_days must be between 1 and 31")
    if per_day_minor is not None and per_day_minor <= 0:
        raise InvalidPartnerFundedSalaryError("per_day_minor must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        employee = _get_employee(session, entity_id, employee_id)
        _get_partner(session, entity_id, partner_id)

        if employee.pay_currency != PayCurrency.TRY:
            raise InvalidPartnerFundedSalaryError(
                "Partner-funded salary is TRY only — use the FX salary flow"
            )

        staff_posting._ensure_period_accrual_up_to(
            session,
            entity_id,
            employee_id,
            accrual_date=payment_date,
            period_year=period_year,
            period_month=period_month,
            period_salary_minor=period_salary_minor,
            actor_id=actor_id,
        )

        if extra_days is not None and per_day_minor is not None:
            per_day_lira = per_day_minor / 100
            extra_desc = f"Extra days ({extra_days} × {per_day_lira:,.2f} ₺/day)"
            staff_posting._accrue_extra_days_try_in_context(
                session,
                entity_id,
                employee_id,
                payment_date=payment_date,
                extra_days=extra_days,
                per_day_minor=per_day_minor,
                description=extra_desc,
                actor_id=actor_id,
            )

        # Same advance math as cash `post_period_salary_payment`.
        total_owed = staff_ledger.remaining_accrual_minor(session, employee_id)
        advance_minor = staff_ledger.outstanding_advance_minor(session, employee_id)
        salary_partner_minor = min(amount_minor, max(0, total_owed))
        excess_advance_minor = amount_minor - salary_partner_minor
        advance_applied_minor = max(
            0, min(advance_minor, total_owed - salary_partner_minor)
        )
        payable_cleared = salary_partner_minor + advance_applied_minor

        if payable_cleared <= 0 and excess_advance_minor <= 0:
            raise InvalidPartnerFundedSalaryError(
                "Nothing to post for this partner-funded salary payment"
            )

        salaries_payable = _chart_account(session, SALARIES_PAYABLE_CODE)
        advances = _chart_account(session, EMPLOYEE_ADVANCES_CODE)
        partner_payable = _chart_account(session, PARTNER_REIMBURSEMENT_PAYABLE_CODE)

        lines = build_partner_funded_salary_lines(
            salaries_payable_id=salaries_payable.id,
            employee_advances_id=advances.id,
            partner_payable_id=partner_payable.id,
            payable_cleared_kurus=payable_cleared,
            advance_applied_kurus=advance_applied_minor,
            partner_credit_kurus=amount_minor,
            excess_advance_kurus=excess_advance_minor,
        )
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            payment_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.PARTNER_SALARY_FRONTED,
        )

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
            excess_row = staff_ledger.persist_staff_ledger_entry(
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
            if staff_entry is None:
                staff_entry = excess_row

        partner_entry = partner_ledger.persist_partner_ledger_entry(
            session,
            partner_id,
            movement_date=payment_date,
            movement_type=PartnerMovementType.SALARY_FRONTED,
            amount_kurus=amount_minor,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
            reference_type="staff_employee",
            reference_id=employee_id,
        )

        session.commit()
        session.refresh(journal_entry)
        assert staff_entry is not None
        session.refresh(staff_entry)
        session.refresh(partner_entry)
        _ = list(journal_entry.lines)

        balance = session.scalar(
            select(func.coalesce(func.sum(StaffLedgerEntry.amount_minor), 0)).where(
                StaffLedgerEntry.employee_id == employee_id
            )
        )
        partner_balance = partner_ledger.reimbursement_balance_kurus(
            session, entity_id, partner_id
        )
        return PartnerFundedSalaryPostResult(
            journal_entry=journal_entry,
            staff_ledger_entry=staff_entry,
            partner_ledger_entry=partner_entry,
            balance_minor=int(balance or 0),
            partner_balance_kurus=partner_balance,
            advance_applied_minor=advance_applied_minor,
        )


def void_partner_funded_salary(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    """Reverse GL + all staff rows + partner salary_fronted row together."""
    with entity_context(session, entity_id):
        require_entity_context()
        entry = session.get(JournalEntry, journal_entry_id)
        if entry is None or entry.entity_id != entity_id:
            raise CorrectionNotFoundError("journal entry not found")
        if entry.source != JournalEntrySource.PARTNER_SALARY_FRONTED:
            raise CorrectionNotFoundError(
                "journal entry is not a partner-funded salary payment"
            )

        staff_rows = list(
            session.scalars(
                select(StaffLedgerEntry).where(
                    StaffLedgerEntry.journal_entry_id == journal_entry_id
                )
            )
        )
        partner_row = session.scalar(
            select(PartnerLedgerEntry).where(
                PartnerLedgerEntry.journal_entry_id == journal_entry_id,
                PartnerLedgerEntry.movement_type == PartnerMovementType.SALARY_FRONTED,
            )
        )
        if not staff_rows or partner_row is None:
            raise CorrectionNotFoundError(
                "partner-funded salary is missing staff or partner ledger rows"
            )

        def reverse_both(sess: Session, _original: JournalEntry, reversal: JournalEntry) -> None:
            for staff_row in staff_rows:
                _append_staff_reversal(
                    sess,
                    staff_row,
                    reversal,
                    actor_id=actor_id,
                    void_date=void_date,
                )
            _append_partner_reversal(
                sess,
                partner_row,
                reversal,
                actor_id=actor_id,
                void_date=void_date,
            )

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        after_gl=reverse_both,
    )
