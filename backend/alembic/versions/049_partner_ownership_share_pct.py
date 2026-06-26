"""Partner ownership share % — informational only (Phase 11 Slice 11.6, Decisions §17)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "049_partner_ownership_share_pct"
down_revision: Union[str, None] = "048_expense_receipt_intake"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "partners",
        sa.Column("ownership_share_pct", sa.Numeric(5, 2), nullable=True),
    )
    op.create_check_constraint(
        "ck_partners_ownership_share_pct_range",
        "partners",
        "ownership_share_pct IS NULL OR (ownership_share_pct >= 0 AND ownership_share_pct <= 100)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_partners_ownership_share_pct_range",
        "partners",
        type_="check",
    )
    op.drop_column("partners", "ownership_share_pct")
