"""Add 3300 Partner Capital account to existing entity charts."""

from typing import Sequence, Union

from alembic import op

revision: str = "070_partner_capital_account"
down_revision: Union[str, None] = "069_classification_rule_vkn_key"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # account_type / normal_balance are varchar; ORM Enum uses uppercase NAMES.
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
            '3300',
            'Partner Capital',
            'Ortak Sermaye Hesabı',
            'EQUITY',
            'CREDIT',
            false,
            true,
            now()
        FROM entities e
        WHERE EXISTS (
            SELECT 1 FROM accounts a WHERE a.entity_id = e.id
        )
        AND NOT EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.entity_id = e.id AND a.code = '3300'
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM accounts
        WHERE code = '3300'
          AND name_en = 'Partner Capital'
          AND NOT EXISTS (
              SELECT 1 FROM journal_entry_lines jel
              JOIN journal_entries je ON je.id = jel.journal_entry_id
              WHERE jel.account_id = accounts.id
          )
        """
    )
