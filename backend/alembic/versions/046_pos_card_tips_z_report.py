"""POS card tips via Z report — add z_report_kurus column (Slice B1).

Adds the optional card-terminal Z-report total to pos_daily_summaries. The card
tip for a day is derived as ``z_report_kurus - confirmed_card_kurus`` and booked
per the entity's ``card_sale_basis`` setting. Additive and nullable — existing
posted summaries are untouched; restaurants that do not use a Z report leave it
NULL and the daily summary posts gross card sales exactly as before.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "046_pos_card_tips_z_report"
down_revision: Union[str, None] = "045_tips_expense_not_liability"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "pos_daily_summaries",
        sa.Column("z_report_kurus", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("pos_daily_summaries", "z_report_kurus")
