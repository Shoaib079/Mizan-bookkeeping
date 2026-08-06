"""Dishes — the reusable menu ingredient list (MENU_PLAN.md slice 1)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "090_dishes"
down_revision: Union[str, None] = "089_ledger_repairs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dishes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=1024), nullable=True),
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
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_dishes_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dishes")),
        sa.UniqueConstraint("entity_id", "name", name="uq_dishes_entity_name"),
    )
    op.create_index(op.f("ix_dishes_entity_id"), "dishes", ["entity_id"])

    op.execute("ALTER TABLE dishes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE dishes FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY dishes_entity_isolation
        ON dishes
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
    op.execute("DROP POLICY IF EXISTS dishes_entity_isolation ON dishes")
    op.drop_index(op.f("ix_dishes_entity_id"), table_name="dishes")
    op.drop_table("dishes")
