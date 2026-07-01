"""Optional last data row for bank import profiles."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "063_bank_import_data_end_row"
down_revision: Union[str, None] = "062_bank_statement_line_dedup"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bank_import_profiles",
        sa.Column("data_end_row", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bank_import_profiles", "data_end_row")
