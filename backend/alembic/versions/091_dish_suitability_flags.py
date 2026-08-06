"""Dish diet becomes three flags instead of one classification.

A single `dietary` value could not express that Dal Tadka belongs on the
vegetarian, non-vegetarian *and* Jain menus — which is how it is actually
used; the current Non-Veg Menu 1 opens with it. Three independent flags can.

Anything already entered is carried across rather than reset: a dish marked
`jain` was suitable everywhere, `veg` suited the veg and non-veg menus, and
`non_veg` suited only the non-veg ones.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "091_dish_suitability_flags"
down_revision: Union[str, None] = "090_dishes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for column in ("suits_veg", "suits_non_veg", "suits_jain"):
        op.add_column(
            "dishes",
            sa.Column(
                column, sa.Boolean(), nullable=False, server_default=sa.true()
            ),
        )

    # Carry over what the single value meant. Untouched rows (dietary NULL)
    # keep the default of suitable-everywhere.
    op.execute(
        """
        UPDATE dishes SET
            suits_veg     = (dietary IN ('veg', 'jain')),
            suits_non_veg = TRUE,
            suits_jain    = (dietary = 'jain')
        WHERE dietary IS NOT NULL
        """
    )

    op.drop_column("dishes", "dietary")


def downgrade() -> None:
    op.add_column(
        "dishes",
        sa.Column(
            "dietary",
            sa.Enum(
                "veg",
                "non_veg",
                "jain",
                name="dietary_kind",
                native_enum=False,
                length=16,
            ),
            nullable=True,
        ),
    )
    # Lossy on the way back — three flags collapse to one value. The strictest
    # that still fits is the honest choice.
    op.execute(
        """
        UPDATE dishes SET dietary = CASE
            WHEN suits_jain THEN 'jain'
            WHEN suits_veg THEN 'veg'
            WHEN suits_non_veg THEN 'non_veg'
            ELSE NULL
        END
        """
    )
    for column in ("suits_jain", "suits_non_veg", "suits_veg"):
        op.drop_column("dishes", column)
