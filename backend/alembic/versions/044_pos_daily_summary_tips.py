"""POS daily summary tips_kurus column — Phase 8.6 Item 4."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "044_pos_daily_summary_tips"
down_revision: Union[str, None] = "043_pos_settlement_batch_unique"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "pos_daily_summaries",
        sa.Column("tips_kurus", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("pos_daily_summaries", "tips_kurus", server_default=None)


def downgrade() -> None:
    op.drop_column("pos_daily_summaries", "tips_kurus")
