"""Sales Discounts expense account (5800) for group-sale write-offs."""

from typing import Sequence, Union

from alembic import op

revision: str = "079_sales_discount_account"
down_revision: Union[str, None] = "078_statement_line_party_employee"
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
            '5800',
            'Sales Discounts',
            'Satış İskontoları',
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
            WHERE a.entity_id = e.id AND a.code = '5800'
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM accounts
        WHERE code = '5800'
          AND name_en = 'Sales Discounts'
          AND NOT EXISTS (
              SELECT 1 FROM journal_entry_lines jel
              WHERE jel.account_id = accounts.id
          )
        """
    )
