"""Drop WIP denomination_count column if a local DB still has it."""

from typing import Sequence, Union

from alembic import op

revision: str = "087_drop_cash_drawer_denomination_count"
down_revision: Union[str, None] = "086_cash_drawer_denomination_count"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE cash_drawer_sessions "
        "DROP COLUMN IF EXISTS denomination_count"
    )


def downgrade() -> None:
    pass
