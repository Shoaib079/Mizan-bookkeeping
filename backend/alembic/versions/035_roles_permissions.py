"""Roles and permissions — users + entity memberships (Decisions §18)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "035_roles_permissions"
down_revision: Union[str, None] = "034_expenses"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "entity_memberships",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "owner",
                "partner",
                "cashier",
                "partner_view_only",
                name="entity_role",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_entity_memberships_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_entity_memberships_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_entity_memberships")),
        sa.UniqueConstraint(
            "entity_id",
            "user_id",
            name="uq_entity_memberships_entity_user",
        ),
    )
    op.create_index(
        op.f("ix_entity_memberships_entity_id"), "entity_memberships", ["entity_id"]
    )
    op.create_index(
        op.f("ix_entity_memberships_user_id"), "entity_memberships", ["user_id"]
    )

    op.execute("ALTER TABLE entity_memberships ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE entity_memberships FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY entity_memberships_entity_isolation ON entity_memberships
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
        "DROP POLICY IF EXISTS entity_memberships_entity_isolation ON entity_memberships"
    )
    op.drop_index(op.f("ix_entity_memberships_user_id"), table_name="entity_memberships")
    op.drop_index(op.f("ix_entity_memberships_entity_id"), table_name="entity_memberships")
    op.drop_table("entity_memberships")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS entity_role")
