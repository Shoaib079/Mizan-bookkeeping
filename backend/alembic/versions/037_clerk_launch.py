"""Clerk launch readiness — migration 037."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "037_clerk_launch"
down_revision: Union[str, None] = "036_entity_memberships_user_lookup"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("external_auth_id", sa.String(length=255), nullable=True),
    )
    op.create_index(
        op.f("ix_users_external_auth_id"),
        "users",
        ["external_auth_id"],
        unique=True,
    )

    op.create_table(
        "auth_audit_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("entity_id", sa.Uuid(), nullable=True),
        sa.Column("clerk_user_id", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("detail", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auth_audit_events")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_auth_audit_events_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_auth_audit_events_entity_id_entities"),
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        op.f("ix_auth_audit_events_created_at"),
        "auth_audit_events",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_auth_audit_events_created_at"), table_name="auth_audit_events")
    op.drop_table("auth_audit_events")
    op.drop_index(op.f("ix_users_external_auth_id"), table_name="users")
    op.drop_column("users", "external_auth_id")
