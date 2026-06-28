"""Entity legal_name — optional registered business name."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "056_entity_legal_name"
down_revision: Union[str, None] = "055_statement_rule_auto_apply"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "entities",
        sa.Column("legal_name", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("entities", "legal_name")
