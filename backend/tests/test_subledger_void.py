"""Subledger void paths — every leg reversed (AGENT_GUARDRAILS §3.7)."""

from __future__ import annotations

from datetime import date

from sqlalchemy import func, select

from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntryStatus
from app.core.ledger.subledger_display import (
    SubledgerDisplayKind,
    subledger_display_for_row,
)
from app.core.staff import posting as staff_posting
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.types import StaffMovementType
from app.core.subledger.control_account_tie import assert_entity_control_accounts_tied
from app.db.session import entity_context
from app.features.expenses.schema import ExpenseCreate
from app.features.expenses.service import create_expense, void_expense_by_id
from app.features.staff.schema import StaffPaymentCreate
from app.features.staff.service import record_payment, void_staff_journal_entry_http
from tests.test_expenses import RENT_EXPENSE_CODE, expense_setup
from tests.test_staff import ACTOR_ID, staff_setup


def _assert_reversal_balances(session, entity_id, reversal_id) -> None:
    with entity_context(session, entity_id):
        rows = session.execute(
            select(JournalEntryLine.side, func.sum(JournalEntryLine.amount_kurus))
            .where(JournalEntryLine.journal_entry_id == reversal_id)
            .group_by(JournalEntryLine.side)
        ).all()
        totals = {side: int(total or 0) for side, total in rows}
    assert totals.get("debit", 0) == totals.get("credit", 0)
    assert totals.get("debit", 0) > 0


def _assert_no_effective_rows_for_journal(
    session, entity_id, journal_id, *, model, description_attr: str = "description"
) -> None:
    """Zero LIVE / EFFECTIVE subledger rows remain for the voided journal."""
    with entity_context(session, entity_id):
        rows = list(
            session.scalars(select(model).where(model.journal_entry_id == journal_id))
        )
        assert rows, "expected original rows to still exist (void, not delete)"
        for row in rows:
            kind, _ = subledger_display_for_row(
                session,
                journal_entry_id=row.journal_entry_id,
                description=getattr(row, description_attr),
            )
            assert kind != SubledgerDisplayKind.EFFECTIVE, (
                f"LIVE row left behind after void: {row.id} kind={kind}"
            )


def test_void_expense_reverses_gl(db_session, expense_setup) -> None:
    entity_id = expense_setup["entity_id"]
    drawer_id = expense_setup["drawer"].id
    account_id = expense_setup["accounts"][RENT_EXPENSE_CODE]

    created = create_expense(
        db_session,
        entity_id,
        ExpenseCreate(
            expense_date=date(2026, 7, 1),
            amount_kurus=50_000,
            expense_account_id=account_id,
            money_account_id=drawer_id,
            description="Rent July",
            actor_id=ACTOR_ID,
            has_source_document=False,
        ),
    )

    result = void_expense_by_id(
        db_session,
        entity_id,
        created.id,
        actor_id=ACTOR_ID,
        reason="Duplicate entry",
    )
    assert result.original_journal_entry_id != result.reversal_journal_entry_id


def test_void_staff_payment(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    cash_gl_id = staff_setup["drawer"].gl_account_id

    with entity_context(db_session, entity_id):
        payment = record_payment(
            db_session,
            entity_id,
            employee_id,
            StaffPaymentCreate(
                payment_date=date(2026, 7, 5),
                amount_minor=100_000,
                description="July salary",
                actor_id=ACTOR_ID,
                payment_account_id=cash_gl_id,
                period_year=2026,
                period_month=7,
                period_salary_minor=100_000,
            ),
        )
        journal_id = payment.journal_entry_id
        assert journal_id is not None

    result = void_staff_journal_entry_http(
        db_session,
        entity_id,
        employee_id,
        journal_id,
        actor_id=ACTOR_ID,
    )
    assert result.reversal_journal_entry_id


def test_void_period_salary_with_advance_applied_reverses_all_staff_rows(
    db_session, staff_setup
) -> None:
    """Guard 1 — salary payment + advance_applied sibling: every leg reverses."""
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    staff_posting.post_advance_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 5, 5),
        amount_minor=200_000,
        description="Avans",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    payment = staff_posting.post_period_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 5, 31),
        cash_minor=800_000,
        period_year=2026,
        period_month=5,
        period_salary_minor=1_000_000,
        description="May salary",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    assert payment.advance_applied_minor == 200_000
    journal_id = payment.journal_entry.id

    with entity_context(db_session, entity_id):
        types = set(
            db_session.scalars(
                select(StaffLedgerEntry.movement_type).where(
                    StaffLedgerEntry.journal_entry_id == journal_id
                )
            ).all()
        )
    assert StaffMovementType.SALARY_PAYMENT in types
    assert StaffMovementType.ADVANCE_APPLIED in types
    assert len(types) >= 2, "vacuous if the payment only owns one row"

    void_result = void_staff_journal_entry_http(
        db_session,
        entity_id,
        employee_id,
        journal_id,
        actor_id=ACTOR_ID,
        reason="Undo combined salary payment",
    )

    _assert_no_effective_rows_for_journal(
        db_session, entity_id, journal_id, model=StaffLedgerEntry
    )
    with entity_context(db_session, entity_id):
        original = db_session.get(JournalEntry, journal_id)
        assert original is not None
        assert original.status == JournalEntryStatus.VOIDED
    _assert_reversal_balances(
        db_session, entity_id, void_result.reversal_journal_entry_id
    )
    assert_entity_control_accounts_tied(db_session, entity_id)


def test_correct_period_salary_with_advance_applied_reverses_every_leg(
    db_session, staff_setup
) -> None:
    """Guard 1 — correcting the multi-row payment leaves no LIVE original legs."""
    from app.core.staff.payment_correction import correct_staff_payment

    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    staff_posting.post_advance_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 8, 1),
        amount_minor=200_000,
        description="Avans",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    payment = staff_posting.post_period_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 8, 31),
        cash_minor=800_000,
        period_year=2026,
        period_month=8,
        period_salary_minor=1_000_000,
        description="Aug salary",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    old_id = payment.journal_entry.id
    assert payment.advance_applied_minor == 200_000

    result = correct_staff_payment(
        db_session,
        entity_id,
        old_id,
        payment_date=date(2026, 8, 31),
        amount_minor=900_000,
        description="Aug salary (corrected)",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
        reason="Paid less",
    )

    _assert_no_effective_rows_for_journal(
        db_session, entity_id, old_id, model=StaffLedgerEntry
    )
    with entity_context(db_session, entity_id):
        new_rows = list(
            db_session.scalars(
                select(StaffLedgerEntry).where(
                    StaffLedgerEntry.journal_entry_id == result.corrected.journal_entry.id
                )
            )
        )
    assert len(new_rows) >= 2, "reposted payment must rebuild every leg"
    assert_entity_control_accounts_tied(db_session, entity_id)
