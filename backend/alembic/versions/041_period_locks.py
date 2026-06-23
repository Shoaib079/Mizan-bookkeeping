"""Period locks tables + RLS — Phase 8.5 Slice 4."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.rls import apply_entity_rls

revision: str = "041_period_locks"
down_revision: Union[str, None] = "040_journal_amend_links"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "period_locks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column(
            "lock_kind",
            sa.Enum("day", "month", name="period_lock_kind", native_enum=False, length=8),
            nullable=False,
        ),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_by", sa.Uuid(), nullable=False),
        sa.Column("reopened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopened_by", sa.Uuid(), nullable=True),
        sa.Column("dirty", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.ForeignKeyConstraint(
            ["closed_by"],
            ["users.id"],
            name=op.f("fk_period_locks_closed_by_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_period_locks_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["reopened_by"],
            ["users.id"],
            name=op.f("fk_period_locks_reopened_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_period_locks")),
        sa.UniqueConstraint(
            "entity_id",
            "lock_kind",
            "period_start",
            name="uq_period_locks_entity_kind_start",
        ),
    )
    op.create_index(op.f("ix_period_locks_entity_id"), "period_locks", ["entity_id"])

    op.create_table(
        "period_lock_audit_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("period_lock_id", sa.Uuid(), nullable=True),
        sa.Column(
            "action",
            sa.Enum(
                "close",
                "reopen",
                "unlock_write",
                name="period_lock_audit_action",
                native_enum=False,
                length=16,
            ),
            nullable=False,
        ),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.String(length=512), nullable=True),
        sa.Column("detail", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_period_lock_audit_events_actor_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_period_lock_audit_events_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["period_lock_id"],
            ["period_locks.id"],
            name=op.f("fk_period_lock_audit_events_period_lock_id_period_locks"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_period_lock_audit_events")),
    )
    op.create_index(
        op.f("ix_period_lock_audit_events_entity_id"),
        "period_lock_audit_events",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_period_lock_audit_events_period_lock_id"),
        "period_lock_audit_events",
        ["period_lock_id"],
    )

    bind = op.get_bind()
    apply_entity_rls(bind)


def downgrade() -> None:
    op.drop_index(
        op.f("ix_period_lock_audit_events_period_lock_id"),
        table_name="period_lock_audit_events",
    )
    op.drop_index(
        op.f("ix_period_lock_audit_events_entity_id"),
        table_name="period_lock_audit_events",
    )
    op.drop_table("period_lock_audit_events")
    op.drop_index(op.f("ix_period_locks_entity_id"), table_name="period_locks")
    op.drop_table("period_locks")
    sa.Enum(name="period_lock_kind").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="period_lock_audit_action").drop(op.get_bind(), checkfirst=True)

    bind = op.get_bind()
    apply_entity_rls(bind)
