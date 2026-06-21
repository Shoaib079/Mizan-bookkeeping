"""Initial entities schema + RLS for entity_settings."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001_entities_rls"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "entities",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_entities")),
    )
    op.create_table(
        "entity_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("value", sa.String(length=1024), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_entity_settings_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_entity_settings")),
        sa.UniqueConstraint("entity_id", "key", name="uq_entity_settings_entity_key"),
    )
    op.create_index(op.f("ix_entity_settings_entity_id"), "entity_settings", ["entity_id"])

    op.execute("ALTER TABLE entity_settings ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE entity_settings FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY entity_settings_entity_isolation ON entity_settings
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
    op.execute("DROP POLICY IF EXISTS entity_settings_entity_isolation ON entity_settings")
    op.drop_index(op.f("ix_entity_settings_entity_id"), table_name="entity_settings")
    op.drop_table("entity_settings")
    op.drop_table("entities")
