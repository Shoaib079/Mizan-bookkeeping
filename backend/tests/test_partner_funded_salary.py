"""Partner-funded staff salary — Dr 2250 / Cr 2150 (+ advance), dual void."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    EMPLOYEE_ADVANCES_CODE,
    PARTNER_REIMBURSEMENT_PAYABLE_CODE,
    SALARIES_PAYABLE_CODE,
    SALARY_EXPENSE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.duplicate_guard import DuplicateRecordError
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError
from app.core.partners import ledger as partner_ledger
from app.core.partners import posting as partner_posting
from app.core.partners.expense_accounts import validate_partner_fronted_expense_account
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.core.staff import posting as staff_posting
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.partner_funded_payment import (
    InvalidPartnerFundedSalaryError,
    post_partner_funded_period_salary,
    void_partner_funded_salary,
)
from app.core.staff.types import PayCurrency, StaffMovementType
from app.core.subledger.control_account_tie import assert_entity_control_accounts_tied
from app.db.session import entity_context
from app.features.partners.models import Partner
from app.features.staff.models import Employee
from app.features.staff.partner_funded_http import record_partner_funded_payment
from app.features.staff.partner_funded_schema import PartnerFundedSalaryCreate
from app.config import settings

from tests.test_staff import ACTOR_ID, _gl_balance, staff_setup


@pytest.fixture
def partner_funded_setup(db_session, staff_setup):
    entity_id = staff_setup["entity_id"]
    with entity_context(db_session, entity_id):
        partner = Partner(name="Funding Partner")
        db_session.add(partner)
        db_session.commit()
        db_session.refresh(partner)
    return {
        **staff_setup,
        "partner_id": partner.id,
    }


def _line_sides(db_session, entity_id, journal_entry_id):
    with entity_context(db_session, entity_id):
        return list(
            db_session.execute(
                select(
                    Account.code,
                    JournalEntryLine.side,
                    JournalEntryLine.amount_kurus,
                )
                .join(Account, Account.id == JournalEntryLine.account_id)
                .where(JournalEntryLine.journal_entry_id == journal_entry_id)
                .order_by(Account.code, JournalEntryLine.side)
            ).all()
        )


def test_partner_funded_posts_2250_2150_no_cash_and_debits_eq_credits(
    db_session, partner_funded_setup
) -> None:
    entity_id = partner_funded_setup["entity_id"]
    employee_id = partner_funded_setup["employee_id"]
    partner_id = partner_funded_setup["partner_id"]
    accounts = partner_funded_setup["accounts"]
    drawer = partner_funded_setup["drawer"]

    result = post_partner_funded_period_salary(
        db_session,
        entity_id,
        employee_id,
        partner_id,
        payment_date=date(2026, 3, 15),
        amount_minor=500_000,
        period_year=2026,
        period_month=2,
        period_salary_minor=1_500_000,
        description="Feb salary — partner paid",
        actor_id=ACTOR_ID,
    )

    assert result.journal_entry.source == JournalEntrySource.PARTNER_SALARY_FRONTED
    lines = _line_sides(db_session, entity_id, result.journal_entry.id)
    codes = {code for code, _side, _amt in lines}
    assert SALARIES_PAYABLE_CODE in codes
    assert PARTNER_REIMBURSEMENT_PAYABLE_CODE in codes
    assert EMPLOYEE_ADVANCES_CODE not in codes
    assert "1000" not in codes and "1010" not in codes
    with entity_context(db_session, entity_id):
        je_account_ids = set(
            db_session.scalars(
                select(JournalEntryLine.account_id).where(
                    JournalEntryLine.journal_entry_id == result.journal_entry.id
                )
            )
        )
    assert drawer.gl_account_id not in je_account_ids

    debits = sum(amt for _c, side, amt in lines if side == AccountNormalBalance.DEBIT)
    credits = sum(amt for _c, side, amt in lines if side == AccountNormalBalance.CREDIT)
    assert debits == credits == 500_000

    assert _gl_balance(
        db_session, entity_id, accounts[SALARIES_PAYABLE_CODE], AccountNormalBalance.CREDIT
    ) == 1_000_000  # 1.5m accrued − 0.5m cleared
    assert _gl_balance(
        db_session,
        entity_id,
        accounts[PARTNER_REIMBURSEMENT_PAYABLE_CODE],
        AccountNormalBalance.CREDIT,
    ) == 500_000


def test_partner_funded_advance_offset_mirrors_cash_path(
    db_session, partner_funded_setup
) -> None:
    entity_id = partner_funded_setup["entity_id"]
    employee_id = partner_funded_setup["employee_id"]
    partner_id = partner_funded_setup["partner_id"]
    drawer = partner_funded_setup["drawer"]

    staff_posting.post_advance_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 2, 5),
        amount_minor=200_000,
        description="Feb avans",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    result = post_partner_funded_period_salary(
        db_session,
        entity_id,
        employee_id,
        partner_id,
        payment_date=date(2026, 2, 28),
        amount_minor=300_000,
        period_year=2026,
        period_month=2,
        period_salary_minor=1_000_000,
        description="Feb rest via partner",
        actor_id=ACTOR_ID,
    )
    assert result.advance_applied_minor == 200_000
    lines = _line_sides(db_session, entity_id, result.journal_entry.id)
    by_code = {}
    for code, side, amt in lines:
        by_code.setdefault(code, {})[side] = amt
    assert by_code[SALARIES_PAYABLE_CODE][AccountNormalBalance.DEBIT] == 500_000
    assert by_code[EMPLOYEE_ADVANCES_CODE][AccountNormalBalance.CREDIT] == 200_000
    assert by_code[PARTNER_REIMBURSEMENT_PAYABLE_CODE][
        AccountNormalBalance.CREDIT
    ] == 300_000


def test_partner_funded_staff_and_partner_rows_and_net_balance(
    db_session, partner_funded_setup
) -> None:
    entity_id = partner_funded_setup["entity_id"]
    employee_id = partner_funded_setup["employee_id"]
    partner_id = partner_funded_setup["partner_id"]

    result = post_partner_funded_period_salary(
        db_session,
        entity_id,
        employee_id,
        partner_id,
        payment_date=date(2026, 4, 10),
        amount_minor=800_000,
        period_year=2026,
        period_month=4,
        period_salary_minor=800_000,
        description="April partner salary",
        actor_id=ACTOR_ID,
    )
    assert result.staff_ledger_entry.movement_type == StaffMovementType.SALARY_PAYMENT
    assert result.staff_ledger_entry.amount_minor == -800_000
    assert result.partner_ledger_entry.movement_type == PartnerMovementType.SALARY_FRONTED
    assert result.partner_ledger_entry.amount_kurus == 800_000
    assert result.balance_minor == 0
    assert result.partner_balance_kurus == 800_000
    with entity_context(db_session, entity_id):
        net = partner_ledger.net_balance_kurus(db_session, entity_id, partner_id)
    assert net == 800_000


def test_partner_funded_5100_once_and_ties(db_session, partner_funded_setup) -> None:
    entity_id = partner_funded_setup["entity_id"]
    employee_id = partner_funded_setup["employee_id"]
    partner_id = partner_funded_setup["partner_id"]
    accounts = partner_funded_setup["accounts"]

    post_partner_funded_period_salary(
        db_session,
        entity_id,
        employee_id,
        partner_id,
        payment_date=date(2026, 5, 1),
        amount_minor=1_200_000,
        period_year=2026,
        period_month=5,
        period_salary_minor=1_200_000,
        description="May partner salary",
        actor_id=ACTOR_ID,
    )
    assert _gl_balance(
        db_session, entity_id, accounts[SALARY_EXPENSE_CODE], AccountNormalBalance.DEBIT
    ) == 1_200_000
    with entity_context(db_session, entity_id):
        salary_jes = list(
            db_session.scalars(
                select(JournalEntry).where(
                    JournalEntry.entity_id == entity_id,
                    JournalEntry.source == JournalEntrySource.STAFF_ACCRUAL,
                )
            )
        )
    assert len(salary_jes) == 1
    assert_entity_control_accounts_tied(db_session, entity_id)


def test_partner_funded_duplicate_guard_and_idempotency_key(
    db_session, partner_funded_setup, client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    entity_id = partner_funded_setup["entity_id"]
    employee_id = partner_funded_setup["employee_id"]
    partner_id = partner_funded_setup["partner_id"]

    payload = PartnerFundedSalaryCreate(
        payment_date=date(2026, 6, 1),
        amount_minor=400_000,
        partner_id=partner_id,
        description="June partner pay",
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=6,
        period_salary_minor=400_000,
    )
    record_partner_funded_payment(db_session, entity_id, employee_id, payload)
    with pytest.raises(DuplicateRecordError):
        record_partner_funded_payment(db_session, entity_id, employee_id, payload)

    key = str(uuid.uuid4())
    body = {
        "payment_date": "2026-07-01",
        "amount_minor": 250_000,
        "partner_id": str(partner_id),
        "description": "July partner pay",
        "actor_id": str(ACTOR_ID),
        "period_year": 2026,
        "period_month": 7,
        "period_salary_minor": 250_000,
    }
    url = f"/entities/{entity_id}/staff/employees/{employee_id}/partner-funded-payments"
    first = client.post(url, json=body, headers={"Idempotency-Key": key})
    second = client.post(url, json=body, headers={"Idempotency-Key": key})
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["journal_entry_id"] == second.json()["journal_entry_id"]
    with entity_context(db_session, entity_id):
        count = db_session.scalar(
            select(func.count()).select_from(JournalEntry).where(
                JournalEntry.source == JournalEntrySource.PARTNER_SALARY_FRONTED,
                JournalEntry.description == "July partner pay",
            )
        )
    assert count == 1


def test_partner_funded_void_restores_gl_and_both_subledgers(
    db_session, partner_funded_setup
) -> None:
    entity_id = partner_funded_setup["entity_id"]
    employee_id = partner_funded_setup["employee_id"]
    partner_id = partner_funded_setup["partner_id"]
    accounts = partner_funded_setup["accounts"]

    result = post_partner_funded_period_salary(
        db_session,
        entity_id,
        employee_id,
        partner_id,
        payment_date=date(2026, 8, 1),
        amount_minor=600_000,
        period_year=2026,
        period_month=8,
        period_salary_minor=600_000,
        description="Aug partner salary",
        actor_id=ACTOR_ID,
    )
    void_partner_funded_salary(
        db_session,
        entity_id,
        result.journal_entry.id,
        actor_id=ACTOR_ID,
        reason="mistake",
    )
    assert _gl_balance(
        db_session,
        entity_id,
        accounts[PARTNER_REIMBURSEMENT_PAYABLE_CODE],
        AccountNormalBalance.CREDIT,
    ) == 0
    with entity_context(db_session, entity_id):
        staff_live = db_session.scalar(
            select(func.coalesce(func.sum(StaffLedgerEntry.amount_minor), 0)).where(
                StaffLedgerEntry.employee_id == employee_id,
                StaffLedgerEntry.movement_type == StaffMovementType.SALARY_PAYMENT,
            )
        )
        partner_live = db_session.scalar(
            select(func.coalesce(func.sum(PartnerLedgerEntry.amount_kurus), 0)).where(
                PartnerLedgerEntry.partner_id == partner_id,
                PartnerLedgerEntry.movement_type == PartnerMovementType.SALARY_FRONTED,
            )
        )
    # Accrual still stands; payment rows reversed → net salary_payment 0
    assert int(staff_live or 0) == 0
    assert int(partner_live or 0) == 0
    assert_entity_control_accounts_tied(db_session, entity_id)


def test_reimbursement_settles_salary_fronted_2150(
    db_session, partner_funded_setup
) -> None:
    entity_id = partner_funded_setup["entity_id"]
    employee_id = partner_funded_setup["employee_id"]
    partner_id = partner_funded_setup["partner_id"]
    drawer = partner_funded_setup["drawer"]
    accounts = partner_funded_setup["accounts"]

    post_partner_funded_period_salary(
        db_session,
        entity_id,
        employee_id,
        partner_id,
        payment_date=date(2026, 9, 1),
        amount_minor=450_000,
        period_year=2026,
        period_month=9,
        period_salary_minor=450_000,
        description="Sep partner salary",
        actor_id=ACTOR_ID,
    )
    partner_posting.post_reimbursement_paid(
        db_session,
        entity_id,
        partner_id,
        payment_date=date(2026, 9, 20),
        amount_kurus=450_000,
        description="Repay salary fronted",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    assert _gl_balance(
        db_session,
        entity_id,
        accounts[PARTNER_REIMBURSEMENT_PAYABLE_CODE],
        AccountNormalBalance.CREDIT,
    ) == 0
    with entity_context(db_session, entity_id):
        assert partner_ledger.reimbursement_balance_kurus(
            db_session, entity_id, partner_id
        ) == 0


def test_partner_funded_void_reverses_advance_applied_and_excess_rows(
    db_session, partner_funded_setup
) -> None:
    """Multi-row partner-funded JEs — void must reverse every staff + partner row.

    Advance applied and excess-as-advance are mutually exclusive on one payment
    (same math as cash). Cover both shapes so neither half-void slips.
    """
    entity_id = partner_funded_setup["entity_id"]
    employee_id = partner_funded_setup["employee_id"]
    partner_id = partner_funded_setup["partner_id"]
    drawer = partner_funded_setup["drawer"]
    accounts = partner_funded_setup["accounts"]

    def _staff_type_net(movement: StaffMovementType) -> int:
        with entity_context(db_session, entity_id):
            return int(
                db_session.scalar(
                    select(
                        func.coalesce(func.sum(StaffLedgerEntry.amount_minor), 0)
                    ).where(
                        StaffLedgerEntry.employee_id == employee_id,
                        StaffLedgerEntry.movement_type == movement,
                    )
                )
                or 0
            )

    def _partner_salary_fronted_net() -> int:
        with entity_context(db_session, entity_id):
            return int(
                db_session.scalar(
                    select(
                        func.coalesce(func.sum(PartnerLedgerEntry.amount_kurus), 0)
                    ).where(
                        PartnerLedgerEntry.partner_id == partner_id,
                        PartnerLedgerEntry.movement_type
                        == PartnerMovementType.SALARY_FRONTED,
                    )
                )
                or 0
            )

    def _rows_on_je(journal_entry_id) -> set[StaffMovementType]:
        with entity_context(db_session, entity_id):
            return {
                row.movement_type
                for row in db_session.scalars(
                    select(StaffLedgerEntry).where(
                        StaffLedgerEntry.journal_entry_id == journal_entry_id
                    )
                )
            }

    # --- shape: excess parked (salary_payment + ADVANCE_PAID + partner) ---
    excess = post_partner_funded_period_salary(
        db_session,
        entity_id,
        employee_id,
        partner_id,
        payment_date=date(2026, 1, 31),
        amount_minor=600_000,
        period_year=2026,
        period_month=1,
        period_salary_minor=500_000,
        description="Jan partner pay with excess",
        actor_id=ACTOR_ID,
    )
    assert excess.advance_applied_minor == 0
    assert _rows_on_je(excess.journal_entry.id) == {
        StaffMovementType.SALARY_PAYMENT,
        StaffMovementType.ADVANCE_PAID,
    }
    void_partner_funded_salary(
        db_session,
        entity_id,
        excess.journal_entry.id,
        actor_id=ACTOR_ID,
        reason="void excess pay",
    )
    assert _staff_type_net(StaffMovementType.SALARY_PAYMENT) == 0
    assert _staff_type_net(StaffMovementType.ADVANCE_PAID) == 0
    assert _partner_salary_fronted_net() == 0
    assert _gl_balance(
        db_session,
        entity_id,
        accounts[PARTNER_REIMBURSEMENT_PAYABLE_CODE],
        AccountNormalBalance.CREDIT,
    ) == 0

    # --- shape: advance applied (salary_payment + ADVANCE_APPLIED + partner) ---
    staff_posting.post_advance_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 2, 5),
        amount_minor=200_000,
        description="Feb avans",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    applied = post_partner_funded_period_salary(
        db_session,
        entity_id,
        employee_id,
        partner_id,
        payment_date=date(2026, 2, 28),
        amount_minor=700_000,
        period_year=2026,
        period_month=2,
        period_salary_minor=1_000_000,
        description="Feb partner pay with advance applied",
        actor_id=ACTOR_ID,
    )
    assert applied.advance_applied_minor == 200_000
    assert _rows_on_je(applied.journal_entry.id) == {
        StaffMovementType.SALARY_PAYMENT,
        StaffMovementType.ADVANCE_APPLIED,
    }
    void_partner_funded_salary(
        db_session,
        entity_id,
        applied.journal_entry.id,
        actor_id=ACTOR_ID,
        reason="void advance-applied pay",
    )
    assert _staff_type_net(StaffMovementType.SALARY_PAYMENT) == 0
    assert _staff_type_net(StaffMovementType.ADVANCE_APPLIED) == 0
    assert _partner_salary_fronted_net() == 0
    # Cash avans still outstanding — only the partner-funded payment was voided.
    assert _staff_type_net(StaffMovementType.ADVANCE_PAID) == -200_000
    assert_entity_control_accounts_tied(db_session, entity_id)


def test_partner_funded_rejects_fx_employee(db_session, partner_funded_setup) -> None:
    entity_id = partner_funded_setup["entity_id"]
    partner_id = partner_funded_setup["partner_id"]
    with entity_context(db_session, entity_id):
        fx_employee = Employee(name="FX Worker", pay_currency=PayCurrency.USD)
        db_session.add(fx_employee)
        db_session.commit()
        db_session.refresh(fx_employee)
        fx_id = fx_employee.id
    with pytest.raises(InvalidPartnerFundedSalaryError, match="TRY only"):
        post_partner_funded_period_salary(
            db_session,
            entity_id,
            fx_id,
            partner_id,
            payment_date=date(2026, 12, 1),
            amount_minor=100_000,
            period_year=2026,
            period_month=12,
            period_salary_minor=100_000,
            description="FX must not use partner-funded",
            actor_id=ACTOR_ID,
        )


def test_cross_entity_partner_cannot_fund_salary(
    db_session, partner_funded_setup, restaurant_b
) -> None:
    entity_a = partner_funded_setup["entity_id"]
    employee_a = partner_funded_setup["employee_id"]
    seed_default_chart(db_session, restaurant_b.id)
    with entity_context(db_session, restaurant_b.id):
        partner_b = Partner(name="Other entity partner")
        db_session.add(partner_b)
        db_session.commit()
        db_session.refresh(partner_b)

    with pytest.raises(LookupError, match="Partner"):
        post_partner_funded_period_salary(
            db_session,
            entity_a,
            employee_a,
            partner_b.id,
            payment_date=date(2026, 10, 1),
            amount_minor=100_000,
            period_year=2026,
            period_month=10,
            period_salary_minor=100_000,
            description="cross entity",
            actor_id=ACTOR_ID,
        )


def test_expense_fronted_rejects_account_5100(db_session, partner_funded_setup) -> None:
    entity_id = partner_funded_setup["entity_id"]
    partner_id = partner_funded_setup["partner_id"]
    accounts = partner_funded_setup["accounts"]

    with entity_context(db_session, entity_id):
        with pytest.raises(InvalidAccountError, match="5100"):
            validate_partner_fronted_expense_account(
                db_session, entity_id, accounts[SALARY_EXPENSE_CODE]
            )
    with pytest.raises(InvalidAccountError, match="5100"):
        partner_posting.post_expense_fronted(
            db_session,
            entity_id,
            partner_id,
            expense_date=date(2026, 11, 1),
            amount_kurus=50_000,
            description="fake salary via expense",
            actor_id=ACTOR_ID,
            expense_account_id=accounts[SALARY_EXPENSE_CODE],
        )
