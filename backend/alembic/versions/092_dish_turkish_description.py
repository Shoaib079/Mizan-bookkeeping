"""Turkish description on dishes.

Descriptions are written for agencies, and some of them read Turkish. Only the
description is translated — the dish names stay as they are, because "Dal
Tadka" is what it is called on the menu in any language.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "092_dish_turkish_description"
down_revision: Union[str, None] = "091_dish_suitability_flags"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "dishes", sa.Column("description_tr", sa.String(length=1024), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("dishes", "description_tr")
