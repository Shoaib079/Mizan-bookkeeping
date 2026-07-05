"""Per-supplier auto-post bank payments toggle (BSF-4)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "073_supplier_auto_post_payments"
down_revision: Union[str, None] = "072_statement_rule_delivery_platform"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "suppliers",
        sa.Column(
            "auto_post_payments",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.alter_column("suppliers", "auto_post_payments", server_default=None)


def downgrade() -> None:
    op.drop_column("suppliers", "auto_post_payments")
