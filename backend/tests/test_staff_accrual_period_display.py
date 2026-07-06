"""Staff salary accrual — one effective row per pay period in ledger display."""

from __future__ import annotations

from datetime import date

from app.core.ledger.models import JournalEntryStatus
from app.core.ledger.subledger_display import SubledgerDisplayKind
from app.core.staff import posting as staff_posting
from app.core.staff.ledger_effective import collapse_accrual_entry_reads
from app.core.staff.types import StaffMovementType
from app.db.session import entity_context
from app.features.staff.schema import StaffLedgerEntryRead
from app.features.staff.service import _staff_entry_reads

from tests.test_staff import ACTOR_ID, staff_setup


def test_period_payment_updates_existing_accrual_instead_of_stacking(
    db_session, staff_setup
) -> None:
    """Changing period_salary on a later payment corrects the accrual — no second row."""
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    staff_posting.post_period_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 5, 5),
        cash_minor=100_000,
        period_year=2026,
        period_month=4,
        period_salary_minor=3_400_000,
        description="April part pay",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    staff_posting.post_period_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 5, 20),
        cash_minor=100_000,
        period_year=2026,
        period_month=4,
        period_salary_minor=3_600_000,
        description="April top-up pay",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    with entity_context(db_session, entity_id):
        from app.core.staff.ledger import list_ledger_entries

        rows = list_ledger_entries(db_session, entity_id, employee_id)
        reads = _staff_entry_reads(db_session, rows)
        april_accruals = [
            r
            for r in reads
            if r.movement_type == StaffMovementType.SALARY_ACCRUED
            and r.period_year == 2026
            and r.period_month == 4
            and r.display_kind == SubledgerDisplayKind.EFFECTIVE
        ]
        assert len(april_accruals) == 1
        assert april_accruals[0].amount_minor == 3_600_000


def test_collapse_accrual_reads_merges_same_period() -> None:
    base = StaffLedgerEntryRead(
        id=__import__("uuid").uuid4(),
        employee_id=__import__("uuid").uuid4(),
        movement_date=date(2026, 5, 5),
        movement_type=StaffMovementType.SALARY_ACCRUED,
        amount_minor=3_400_000,
        try_cost_kurus=None,
        description="Salary 2026-04",
        actor_id=ACTOR_ID,
        journal_entry_id=__import__("uuid").uuid4(),
        period_year=2026,
        period_month=4,
        created_at=__import__("datetime").datetime(2026, 5, 5, 10, 0, 0),
        display_kind=SubledgerDisplayKind.EFFECTIVE,
        was_corrected=False,
    )
    second = base.model_copy(
        update={
            "id": __import__("uuid").uuid4(),
            "movement_date": date(2026, 5, 7),
            "amount_minor": 200_000,
            "created_at": __import__("datetime").datetime(2026, 5, 7, 10, 0, 0),
        }
    )
    merged = collapse_accrual_entry_reads([base, second])
    assert len(merged) == 1
    assert merged[0].amount_minor == 3_600_000
