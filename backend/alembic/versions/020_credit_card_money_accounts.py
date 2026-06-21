"""Extend money_account_kind for credit card sub-accounts (Decisions §12)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "020_credit_card_money_accounts"
down_revision: Union[str, None] = "019_pos_settlements"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "money_accounts",
        "account_kind",
        existing_type=sa.Enum(
            "bank",
            "cash",
            name="money_account_kind",
            native_enum=False,
            length=8,
        ),
        type_=sa.Enum(
            "bank",
            "cash",
            "credit_card",
            name="money_account_kind",
            native_enum=False,
            length=12,
        ),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "money_accounts",
        "account_kind",
        existing_type=sa.Enum(
            "bank",
            "cash",
            "credit_card",
            name="money_account_kind",
            native_enum=False,
            length=12,
        ),
        type_=sa.Enum(
            "bank",
            "cash",
            name="money_account_kind",
            native_enum=False,
            length=8,
        ),
        existing_nullable=False,
    )
