"""Store delivery_platform_id on statement classification rules."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "072_statement_rule_delivery_platform"
down_revision: Union[str, None] = "071_normalize_account_enum_names"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "statement_classification_rules",
        sa.Column("delivery_platform_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_statement_classification_rules_delivery_platform_id_delivery_platforms"),
        "statement_classification_rules",
        "delivery_platforms",
        ["delivery_platform_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_statement_classification_rules_delivery_platform_id"),
        "statement_classification_rules",
        ["delivery_platform_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_statement_classification_rules_delivery_platform_id"),
        table_name="statement_classification_rules",
    )
    op.drop_constraint(
        op.f("fk_statement_classification_rules_delivery_platform_id_delivery_platforms"),
        "statement_classification_rules",
        type_="foreignkey",
    )
    op.drop_column("statement_classification_rules", "delivery_platform_id")
