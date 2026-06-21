"""Supplier master table with entity-scoped RLS."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009_suppliers"
down_revision: Union[str, None] = "008_invoice_drafts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "suppliers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=512), nullable=False),
        sa.Column("vkn", sa.String(length=11), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("iban", sa.String(length=34), nullable=True),
        sa.Column("notes", sa.String(length=2048), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_suppliers_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_suppliers")),
        sa.UniqueConstraint("entity_id", "vkn", name="uq_suppliers_entity_vkn"),
    )
    op.create_index(op.f("ix_suppliers_entity_id"), "suppliers", ["entity_id"])

    op.execute("ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE suppliers FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY suppliers_entity_isolation ON suppliers
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
    op.execute("DROP POLICY IF EXISTS suppliers_entity_isolation ON suppliers")
    op.drop_index(op.f("ix_suppliers_entity_id"), table_name="suppliers")
    op.drop_table("suppliers")
