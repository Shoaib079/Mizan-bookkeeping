"""Optional extra description columns for bank import profiles."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "064_bank_import_description_extra_cols"
down_revision: Union[str, None] = "063_bank_import_data_end_row"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bank_import_profiles",
        sa.Column(
            "description_extra_cols",
            sa.JSON(),
            nullable=False,
            server_default="[]",
        ),
    )


def downgrade() -> None:
    op.drop_column("bank_import_profiles", "description_extra_cols")
