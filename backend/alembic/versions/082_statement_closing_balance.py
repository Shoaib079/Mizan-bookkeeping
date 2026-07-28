"""Bank statement closing balance — lets reconciliation catch missing lines.

Without the balance the bank itself printed, a reconciliation can only prove
that the books agree with the lines that were imported. If the file was
truncated or a day was dropped, books and file agree while both are wrong.
Nullable: existing statements have no stated balance, and not every bank format
exposes one, so it can also be filled in by hand.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "082_statement_closing_balance"
down_revision: Union[str, None] = "081_card_commission_account"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bank_statements",
        sa.Column("closing_balance_kurus", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bank_statements", "closing_balance_kurus")
