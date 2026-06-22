"""Partial unique index: one posted POS daily summary per entity + business day."""

from typing import Sequence, Union

from alembic import op

revision: str = "029_pos_daily_summaries_posted_date_unique"
down_revision: Union[str, None] = "028_pos_daily_summaries"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE UNIQUE INDEX uq_pos_daily_summaries_entity_date_posted
        ON pos_daily_summaries (entity_id, summary_date)
        WHERE status = 'posted'
        """
    )


def downgrade() -> None:
    op.drop_index(
        "uq_pos_daily_summaries_entity_date_posted",
        table_name="pos_daily_summaries",
    )
