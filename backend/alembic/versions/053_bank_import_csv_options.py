"""Add CSV encoding and delimiter to bank import profiles."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "053_bank_import_csv_options"
down_revision: Union[str, None] = "052_bank_import_profiles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bank_import_profiles",
        sa.Column(
            "csv_encoding",
            sa.String(length=16),
            nullable=False,
            server_default="auto",
        ),
    )
    op.add_column(
        "bank_import_profiles",
        sa.Column(
            "csv_delimiter",
            sa.String(length=8),
            nullable=False,
            server_default="auto",
        ),
    )


def downgrade() -> None:
    op.drop_column("bank_import_profiles", "csv_delimiter")
    op.drop_column("bank_import_profiles", "csv_encoding")
