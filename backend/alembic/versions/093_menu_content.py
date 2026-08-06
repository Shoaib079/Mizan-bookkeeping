"""Menus gain a price, a category and an ordered dish list.

Until now a group menu was a name. The Word document it replaces carries a
price marked "+KDV", a grouping (veg / Jain / non-veg / special / catering)
and a list of dishes in a deliberate order — rice, naan and dessert last.

The dish list is references rather than text, so correcting a spelling on the
dish fixes every menu at once. That is the whole reason for the table.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "093_menu_content"
down_revision: Union[str, None] = "092_dish_turkish_description"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "group_menus", sa.Column("description", sa.String(length=1024), nullable=True)
    )
    op.add_column("group_menus", sa.Column("price_minor", sa.Integer(), nullable=True))
    op.add_column(
        "group_menus",
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="USD"
        ),
    )
    op.add_column(
        "group_menus", sa.Column("surcharge_minor", sa.Integer(), nullable=True)
    )
    op.add_column(
        "group_menus",
        sa.Column("surcharge_label", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "group_menus",
        sa.Column(
            "price_excludes_vat", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )
    op.add_column(
        "group_menus",
        sa.Column(
            "category",
            sa.Enum(
                "veg",
                "jain",
                "non_veg",
                "special",
                "catering",
                name="menu_category",
                native_enum=False,
                length=16,
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "group_menus",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "group_menu_lines",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("group_menu_id", sa.Uuid(), nullable=False),
        sa.Column("dish_id", sa.Uuid(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_group_menu_lines_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["group_menu_id"],
            ["group_menus.id"],
            name=op.f("fk_group_menu_lines_group_menu_id_group_menus"),
            ondelete="CASCADE",
        ),
        # RESTRICT, not CASCADE: deleting a dish that menus still list would
        # silently shorten those menus. Dishes are retired, not deleted.
        sa.ForeignKeyConstraint(
            ["dish_id"],
            ["dishes.id"],
            name=op.f("fk_group_menu_lines_dish_id_dishes"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_group_menu_lines")),
        # A dish twice on one menu is the Jain-menu-lists-White-Rice-twice
        # error that survived three years of Word documents.
        sa.UniqueConstraint(
            "group_menu_id", "dish_id", name="uq_group_menu_lines_menu_dish"
        ),
    )
    op.create_index(
        op.f("ix_group_menu_lines_entity_id"), "group_menu_lines", ["entity_id"]
    )
    op.create_index(
        op.f("ix_group_menu_lines_group_menu_id"), "group_menu_lines", ["group_menu_id"]
    )
    op.create_index(
        op.f("ix_group_menu_lines_dish_id"), "group_menu_lines", ["dish_id"]
    )

    op.execute("ALTER TABLE group_menu_lines ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE group_menu_lines FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY group_menu_lines_entity_isolation
        ON group_menu_lines
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS group_menu_lines_entity_isolation ON group_menu_lines"
    )
    op.drop_index(op.f("ix_group_menu_lines_dish_id"), table_name="group_menu_lines")
    op.drop_index(
        op.f("ix_group_menu_lines_group_menu_id"), table_name="group_menu_lines"
    )
    op.drop_index(op.f("ix_group_menu_lines_entity_id"), table_name="group_menu_lines")
    op.drop_table("group_menu_lines")

    for column in (
        "sort_order",
        "category",
        "price_excludes_vat",
        "surcharge_label",
        "surcharge_minor",
        "currency",
        "price_minor",
        "description",
    ):
        op.drop_column("group_menus", column)
