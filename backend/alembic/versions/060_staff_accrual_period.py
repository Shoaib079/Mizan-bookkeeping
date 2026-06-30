"""Salary accrual period on staff ledger entries (FS)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "060_staff_accrual_period"
down_revision: Union[str, None] = "059_delivery_monthly_sales"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "staff_ledger_entries",
        sa.Column("period_year", sa.Integer(), nullable=True),
    )
    op.add_column(
        "staff_ledger_entries",
        sa.Column("period_month", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("staff_ledger_entries", "period_month")
    op.drop_column("staff_ledger_entries", "period_year")
