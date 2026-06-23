"""Unique POS settlement per card sales batch — Phase 8.6 Item 3."""

from typing import Sequence, Union

from alembic import op

revision: str = "043_pos_settlement_batch_unique"
down_revision: Union[str, None] = "042_period_lock_immutability"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_pos_settlements_card_sales_batch_id",
        "pos_settlements",
        ["card_sales_batch_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_pos_settlements_card_sales_batch_id",
        "pos_settlements",
        type_="unique",
    )
