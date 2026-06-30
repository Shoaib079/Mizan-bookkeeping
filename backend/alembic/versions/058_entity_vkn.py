"""Entity VKN (vergi numarası) — required on create via API; nullable for legacy rows."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "058_entity_vkn"
down_revision: Union[str, None] = "057_expense_item_default_account"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "entities",
        sa.Column("vkn", sa.String(length=11), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("entities", "vkn")
