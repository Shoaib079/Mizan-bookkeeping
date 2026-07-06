from datetime import date

from app.core.ledger.subledger_display import SubledgerDisplayKind
from app.core.staff import posting as staff_posting
from app.core.staff.ledger import current_balance_minor
from app.core.staff.types import StaffMovementType
from app.db.session import entity_context
from app.features.staff.service import get_staff_ledger, void_staff_journal_entry_http

from tests.test_staff import ACTOR_ID, staff_setup


def test_void_staff_accrual_excluded_from_balance(db_session, staff_setup) -> None:
    """Voided accrual must not inflate staff balance — use effective rows only."""
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]

    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 5, 5),
        amount_minor=3_400_000,
        description="Salary 2026-04",
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=4,
    )
    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 7, 6),
        amount_minor=3_600_000,
        description="Salary 2026-04",
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=4,
    )

    assert current_balance_minor(db_session, entity_id, employee_id) == 7_000_000

    with entity_context(db_session, entity_id):
        from app.core.staff.ledger import list_ledger_entries

        rows = list_ledger_entries(db_session, entity_id, employee_id)
        second = next(row for row in rows if row.amount_minor == 3_600_000)
        assert second.journal_entry_id is not None

    void_staff_journal_entry_http(
        db_session,
        entity_id,
        employee_id,
        second.journal_entry_id,
        actor_id=ACTOR_ID,
        reason="Duplicate accrual",
    )

    assert current_balance_minor(db_session, entity_id, employee_id) == 3_400_000

    ledger = get_staff_ledger(db_session, entity_id, employee_id)
    assert ledger.balance_minor == 3_400_000
    effective_accruals = [
        entry
        for entry in ledger.entries
        if entry.movement_type == StaffMovementType.SALARY_ACCRUED
        and entry.display_kind == SubledgerDisplayKind.EFFECTIVE
    ]
    assert len(effective_accruals) == 1
    assert effective_accruals[0].amount_minor == 3_400_000

    superseded = [
        entry
        for entry in ledger.entries
        if entry.movement_type == StaffMovementType.SALARY_ACCRUED
        and entry.display_kind == SubledgerDisplayKind.SUPERSEDED
    ]
    assert len(superseded) == 1
    assert superseded[0].amount_minor == 3_600_000
