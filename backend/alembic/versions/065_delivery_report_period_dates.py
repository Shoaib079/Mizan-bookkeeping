"""Delivery report period as date range (from–to) instead of month-only."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "065_delivery_report_period_dates"
down_revision: Union[str, None] = "064_bank_import_description_extra_cols"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "delivery_reports",
        sa.Column("period_start", sa.Date(), nullable=True),
    )
    op.add_column(
        "delivery_reports",
        sa.Column("period_end", sa.Date(), nullable=True),
    )
    op.execute(
        """
        UPDATE delivery_reports
        SET period_start = make_date(period_year, period_month, 1),
            period_end = report_date
        """
    )
    op.alter_column("delivery_reports", "period_start", nullable=False)
    op.alter_column("delivery_reports", "period_end", nullable=False)

    op.drop_index(
        "uq_delivery_reports_entity_platform_period_posted",
        table_name="delivery_reports",
    )
    op.create_index(
        "uq_delivery_reports_entity_platform_period_range_posted",
        "delivery_reports",
        ["entity_id", "delivery_platform_id", "period_start", "period_end"],
        unique=True,
        postgresql_where=sa.text("status = 'posted'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_delivery_reports_entity_platform_period_range_posted",
        table_name="delivery_reports",
    )
    op.create_index(
        "uq_delivery_reports_entity_platform_period_posted",
        "delivery_reports",
        ["entity_id", "delivery_platform_id", "period_year", "period_month"],
        unique=True,
        postgresql_where=sa.text("status = 'posted'"),
    )
    op.drop_column("delivery_reports", "period_end")
    op.drop_column("delivery_reports", "period_start")
