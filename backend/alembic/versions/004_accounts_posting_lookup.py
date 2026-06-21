"""RLS policy: posting boundary may read accounts for cross-entity validation."""

from typing import Sequence, Union

from alembic import op

revision: str = "004_accounts_posting_lookup"
down_revision: Union[str, None] = "003_journal_rls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP POLICY IF EXISTS accounts_posting_lookup ON accounts")
    op.execute(
        """
        CREATE POLICY accounts_posting_lookup ON accounts
        FOR SELECT
        USING (current_setting('app.posting_lookup', true) = '1')
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS accounts_posting_lookup ON accounts")
