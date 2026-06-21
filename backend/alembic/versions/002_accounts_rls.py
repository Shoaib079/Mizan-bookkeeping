"""Add accounts table with entity-scoped RLS."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_accounts_rls"
down_revision: Union[str, None] = "001_entities_rls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("name_en", sa.String(length=255), nullable=False),
        sa.Column("name_tr", sa.String(length=255), nullable=False),
        sa.Column("account_type", sa.String(length=16), nullable=False),
        sa.Column("normal_balance", sa.String(length=8), nullable=False),
        sa.Column("accepts_opening_balance", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_accounts_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_accounts")),
        sa.UniqueConstraint("entity_id", "code", name="uq_accounts_entity_code"),
    )
    op.create_index(op.f("ix_accounts_entity_id"), "accounts", ["entity_id"])

    op.execute("ALTER TABLE accounts ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE accounts FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY accounts_entity_isolation ON accounts
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
    op.execute("DROP POLICY IF EXISTS accounts_entity_isolation ON accounts")
    op.drop_index(op.f("ix_accounts_entity_id"), table_name="accounts")
    op.drop_table("accounts")
