"""Run-once ledger repair registry (entity-scoped).

Named repair recipes void+repost historical journals; this table records
which keys already applied per restaurant so re-deploy is a no-op.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db.rls import apply_entity_rls

revision: str = "089_ledger_repairs"
down_revision: Union[str, None] = "088_membership_grants"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ledger_repairs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("repair_key", sa.String(length=128), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("report_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_ledger_repairs_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_ledger_repairs_actor_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ledger_repairs")),
        sa.UniqueConstraint(
            "entity_id",
            "repair_key",
            name=op.f("uq_ledger_repairs_entity_key"),
        ),
    )
    op.create_index(op.f("ix_ledger_repairs_entity_id"), "ledger_repairs", ["entity_id"])
    op.create_index(op.f("ix_ledger_repairs_repair_key"), "ledger_repairs", ["repair_key"])

    apply_entity_rls(op.get_bind())


def downgrade() -> None:
    op.drop_index(op.f("ix_ledger_repairs_repair_key"), table_name="ledger_repairs")
    op.drop_index(op.f("ix_ledger_repairs_entity_id"), table_name="ledger_repairs")
    op.drop_table("ledger_repairs")
