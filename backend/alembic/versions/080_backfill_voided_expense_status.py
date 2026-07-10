"""Backfill expense_entries.status = VOIDED for entries whose journal was voided.

Before the void flow set the expense status, voiding only reversed the GL journal and
left the expense row marked 'posted', so it kept showing as an active expense. This
reconciles those historical rows. Uses the ORM so enum casing is handled correctly.
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import select, update
from sqlalchemy.orm import Session

revision: str = "080_backfill_voided_expense_status"
down_revision: Union[str, None] = "079_sales_discount_account"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from app.core.ledger.models import JournalEntry, JournalEntryStatus
    from app.features.expenses.models import ExpenseEntry, ExpenseEntryStatus

    session = Session(bind=op.get_bind())
    try:
        voided_journal_ids = list(
            session.scalars(
                select(JournalEntry.id).where(
                    JournalEntry.status == JournalEntryStatus.VOIDED
                )
            ).all()
        )
        if voided_journal_ids:
            session.execute(
                update(ExpenseEntry)
                .where(
                    ExpenseEntry.journal_entry_id.in_(voided_journal_ids),
                    ExpenseEntry.status == ExpenseEntryStatus.POSTED,
                )
                .values(status=ExpenseEntryStatus.VOIDED)
            )
            session.commit()
    finally:
        session.close()


def downgrade() -> None:
    # One-way data reconciliation; nothing to revert.
    pass
