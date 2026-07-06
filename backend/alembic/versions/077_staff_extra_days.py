"""Extra days pay — optional day count on staff ledger entries."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "077_staff_extra_days"
down_revision: Union[str, None] = "076_agency_group_sales_v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "staff_ledger_entries",
        sa.Column("extra_days", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("staff_ledger_entries", "extra_days")
