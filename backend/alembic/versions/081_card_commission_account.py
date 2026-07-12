"""Card Commission expense account (5310) — split card acquirer commission from bank charges."""

from typing import Sequence, Union

from alembic import op

revision: str = "081_card_commission_account"
down_revision: Union[str, None] = "080_backfill_voided_expense_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO accounts (
            id, entity_id, code, name_en, name_tr,
            account_type, normal_balance, accepts_opening_balance,
            is_active, created_at
        )
        SELECT
            gen_random_uuid(),
            e.id,
            '5310',
            'Card Commission',
            'Kart Komisyonu',
            'EXPENSE',
            'DEBIT',
            false,
            true,
            now()
        FROM entities e
        WHERE EXISTS (
            SELECT 1 FROM accounts a WHERE a.entity_id = e.id
        )
        AND NOT EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.entity_id = e.id AND a.code = '5310'
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM accounts
        WHERE code = '5310'
          AND name_en = 'Card Commission'
          AND NOT EXISTS (
              SELECT 1 FROM journal_entry_lines jel
              WHERE jel.account_id = accounts.id
          )
        """
    )
