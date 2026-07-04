"""Invoice draft other taxes — ÖİV/telecom tax support."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "068_invoice_draft_other_taxes"
down_revision: Union[str, None] = "067_invoice_draft_iade_reference"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "invoice_drafts",
        sa.Column(
            "other_taxes_kurus",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("invoice_drafts", "other_taxes_kurus")
