"""Cash drawer optional session + owner reopen (Phase 11 Slice 11.13)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.provisioning import apply_database_integrity

revision: str = "050_cash_drawer_optional_session"
down_revision: Union[str, None] = "049_partner_ownership_share_pct"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "cash_movements",
        "session_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )
    op.add_column(
        "cash_drawer_sessions",
        sa.Column("reopened_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "cash_drawer_sessions",
        sa.Column("reopened_by", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "cash_drawer_sessions",
        sa.Column("reopen_reason", sa.String(length=512), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_cash_drawer_sessions_reopened_by_users"),
        "cash_drawer_sessions",
        "users",
        ["reopened_by"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "cash_drawer_audit_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("cash_drawer_session_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.String(length=512), nullable=True),
        sa.Column("detail", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_cash_drawer_audit_events_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["cash_drawer_session_id"],
            ["cash_drawer_sessions.id"],
            name=op.f(
                "fk_cash_drawer_audit_events_cash_drawer_session_id_cash_drawer_sessions"
            ),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_cash_drawer_audit_events_actor_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cash_drawer_audit_events")),
    )
    op.create_index(
        op.f("ix_cash_drawer_audit_events_entity_id"),
        "cash_drawer_audit_events",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_cash_drawer_audit_events_cash_drawer_session_id"),
        "cash_drawer_audit_events",
        ["cash_drawer_session_id"],
    )

    op.execute("ALTER TABLE cash_drawer_audit_events ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE cash_drawer_audit_events FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY cash_drawer_audit_events_entity_isolation ON cash_drawer_audit_events
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )

    apply_database_integrity(op.get_bind())


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS cash_drawer_audit_events_entity_isolation ON cash_drawer_audit_events"
    )
    op.drop_index(
        op.f("ix_cash_drawer_audit_events_cash_drawer_session_id"),
        table_name="cash_drawer_audit_events",
    )
    op.drop_index(
        op.f("ix_cash_drawer_audit_events_entity_id"),
        table_name="cash_drawer_audit_events",
    )
    op.drop_table("cash_drawer_audit_events")
    op.drop_constraint(
        op.f("fk_cash_drawer_sessions_reopened_by_users"),
        "cash_drawer_sessions",
        type_="foreignkey",
    )
    op.drop_column("cash_drawer_sessions", "reopen_reason")
    op.drop_column("cash_drawer_sessions", "reopened_by")
    op.drop_column("cash_drawer_sessions", "reopened_at")
    op.alter_column(
        "cash_movements",
        "session_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
