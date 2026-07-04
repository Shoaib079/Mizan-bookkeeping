"""Normalize account_type, normal_balance, and journal line side to enum NAMES.

Older raw-SQL migrations inserted lowercase enum values ('equity', 'debit').
SQLAlchemy Enum(..., native_enum=False) without values_callable persists and
validates against the uppercase enum member NAMES (EQUITY, DEBIT). This fixes
stale rows (e.g. 3300 from the first 070 run) without re-running 070.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "071_normalize_account_enum_names"
down_revision: Union[str, None] = "070_partner_capital_account"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE accounts
        SET account_type = UPPER(account_type),
            normal_balance = UPPER(normal_balance)
        WHERE account_type <> UPPER(account_type)
           OR normal_balance <> UPPER(normal_balance)
        """
    )
    op.execute(
        """
        UPDATE journal_entry_lines
        SET side = UPPER(side)
        WHERE side <> UPPER(side)
        """
    )


def downgrade() -> None:
    pass
