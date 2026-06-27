"""Drop 5700 Tips Expense — tips use any expense category (Phase 12 Slice 0a).

Pre-launch: no postings to 5700 expected. Guarded abort if journal lines exist.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "051_drop_tips_expense_5700"
down_revision: Union[str, None] = "050_cash_drawer_optional_session"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    posting_count = (
        bind.execute(
            sa.text(
                """
                SELECT count(*)
                FROM journal_entry_lines jel
                JOIN accounts a ON a.id = jel.account_id
                WHERE a.code = '5700'
                """
            )
        ).scalar()
        or 0
    )
    if posting_count:
        raise RuntimeError(
            f"Refusing to drop 5700 Tips Expense: {posting_count} journal line(s) "
            "exist. Reverse via the posting boundary first."
        )

    op.execute("DELETE FROM accounts WHERE code = '5700'")


def downgrade() -> None:
    op.execute(
        """
        INSERT INTO accounts (
            id, entity_id, code, name_en, name_tr, account_type, normal_balance,
            accepts_opening_balance, is_active, created_at
        )
        SELECT
            gen_random_uuid(),
            e.id,
            '5700',
            'Tips Expense',
            'Bahşiş Gideri',
            'expense',
            'debit',
            false,
            true,
            NOW()
        FROM entities e
        WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.entity_id = e.id)
        AND NOT EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.entity_id = e.id AND a.code = '5700'
        )
        """
    )
