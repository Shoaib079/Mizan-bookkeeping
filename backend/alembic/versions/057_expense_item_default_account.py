"""Expense item default account — learned description→account mapping."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "057_expense_item_default_account"
down_revision: Union[str, None] = "056_entity_legal_name"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "expense_items",
        sa.Column("default_expense_account_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_expense_items_default_expense_account_id_accounts"),
        "expense_items",
        "accounts",
        ["default_expense_account_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        op.f("ix_expense_items_default_expense_account_id"),
        "expense_items",
        ["default_expense_account_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_expense_items_default_expense_account_id"),
        table_name="expense_items",
    )
    op.drop_constraint(
        op.f("fk_expense_items_default_expense_account_id_accounts"),
        "expense_items",
        type_="foreignkey",
    )
    op.drop_column("expense_items", "default_expense_account_id")
