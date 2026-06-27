"""Statement rule auto-apply — correction_count, classification_source."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "055_statement_rule_auto_apply"
down_revision: Union[str, None] = "054_statement_classification_rules"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "statement_classification_rules",
        sa.Column("correction_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "statement_classification_rules",
        sa.Column(
            "confirmations_since_correction",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )
    op.execute(
        """
        UPDATE statement_classification_rules
        SET confirmations_since_correction = confirmation_count
        """
    )
    op.alter_column("statement_classification_rules", "correction_count", server_default=None)
    op.alter_column(
        "statement_classification_rules", "confirmations_since_correction", server_default=None
    )

    op.add_column(
        "bank_statement_lines",
        sa.Column("classification_source", sa.String(length=16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bank_statement_lines", "classification_source")
    op.drop_column("statement_classification_rules", "confirmations_since_correction")
    op.drop_column("statement_classification_rules", "correction_count")
