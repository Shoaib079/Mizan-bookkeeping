"""Idempotency records table — Phase 8.5 Slice 1."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "039_idempotency"
down_revision: Union[str, None] = "038_db_provisioning"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "idempotency_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("scope_user_id", sa.String(length=64), nullable=False),
        sa.Column("method", sa.String(length=16), nullable=False),
        sa.Column("path", sa.String(length=2048), nullable=False),
        sa.Column("idempotency_key", sa.String(length=64), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("response_body", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_idempotency_records")),
        sa.UniqueConstraint(
            "scope_user_id",
            "method",
            "path",
            "idempotency_key",
            name="uq_idempotency_scope_request",
        ),
    )
    op.create_index(
        op.f("ix_idempotency_records_scope_user_id"),
        "idempotency_records",
        ["scope_user_id"],
    )
    op.create_index(
        op.f("ix_idempotency_records_idempotency_key"),
        "idempotency_records",
        ["idempotency_key"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_idempotency_records_idempotency_key"), table_name="idempotency_records")
    op.drop_index(op.f("ix_idempotency_records_scope_user_id"), table_name="idempotency_records")
    op.drop_table("idempotency_records")
