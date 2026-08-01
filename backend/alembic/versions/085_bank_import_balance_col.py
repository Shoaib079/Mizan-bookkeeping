"""Optional running-balance column on bank import profiles."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "085_bank_import_balance_col"
down_revision: Union[str, None] = "084_journal_cash_flow_category"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bank_import_profiles",
        sa.Column("balance_col", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bank_import_profiles", "balance_col")
