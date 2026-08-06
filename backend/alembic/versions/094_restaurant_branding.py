"""A restaurant gains the details its documents print (MENU_PLAN.md slice 3).

Until now a restaurant was a name, a legal name and a VKN. The menu that goes
to agencies also carries an address, two phone numbers, an email, a logo and a
block of terms — all of which were typed into each Word document by hand, and
one of which (the address) was wrong on a whole year of menus because the file
had been copied from another location.

Stored on the restaurant row, they are printed from the same record as the
name, so the two cannot disagree.

`entities` is not entity-scoped — it is the table the scoping keys off — so
there is no RLS policy to add here. Access is guarded by membership on the
routes, exactly as it already is for the VKN.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "094_restaurant_branding"
down_revision: Union[str, None] = "093_menu_content"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_COLUMNS = (
    ("address", sa.String(length=512)),
    ("phone_primary", sa.String(length=64)),
    ("phone_secondary", sa.String(length=64)),
    ("email", sa.String(length=255)),
    ("menu_terms", sa.String(length=4096)),
    ("menu_validity_note", sa.String(length=255)),
    ("logo_stored_path", sa.String(length=512)),
    ("logo_media_type", sa.String(length=64)),
)


def upgrade() -> None:
    for name, column_type in NEW_COLUMNS:
        op.add_column("entities", sa.Column(name, column_type, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(NEW_COLUMNS):
        op.drop_column("entities", name)
