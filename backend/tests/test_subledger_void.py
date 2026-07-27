from datetime import date

from tests.test_expenses import RENT_EXPENSE_CODE, expense_setup
from tests.test_staff import ACTOR_ID, staff_setup
from app.features.expenses.schema import ExpenseCreate
from app.features.expenses.service import create_expense, void_expense_by_id
from app.features.staff.schema import StaffPaymentCreate
from app.features.staff.service import record_payment, void_staff_journal_entry_http
from app.db.session import entity_context


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
    from app.core.staff import posting as staff_posting
    from app.core.staff.models import StaffLedgerEntry
    from app.core.staff.types import StaffMovementType
    from sqlalchemy import func, select

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

    void_staff_journal_entry_http(
        db_session,
        entity_id,
        employee_id,
        journal_id,
        actor_id=ACTOR_ID,
        reason="Undo combined salary payment",
    )

    with entity_context(db_session, entity_id):
        effective_count = db_session.scalar(
            select(func.count())
            .select_from(StaffLedgerEntry)
            .where(
                StaffLedgerEntry.journal_entry_id == journal_id,
            )
        )
    assert effective_count == 2
