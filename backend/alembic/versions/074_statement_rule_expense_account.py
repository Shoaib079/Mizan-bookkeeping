"""Learned statement rules — expense account for store purchases (P8)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "074_statement_rule_expense_account"
down_revision: Union[str, None] = "073_supplier_auto_post_payments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "statement_classification_rules",
        sa.Column("expense_account_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_statement_classification_rules_expense_account_id_accounts"),
        "statement_classification_rules",
        "accounts",
        ["expense_account_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_statement_classification_rules_expense_account_id"),
        "statement_classification_rules",
        ["expense_account_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_statement_classification_rules_expense_account_id"),
        table_name="statement_classification_rules",
    )
    op.drop_constraint(
        op.f("fk_statement_classification_rules_expense_account_id_accounts"),
        "statement_classification_rules",
        type_="foreignkey",
    )
    op.drop_column("statement_classification_rules", "expense_account_id")
