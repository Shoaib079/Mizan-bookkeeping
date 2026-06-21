"""Journal entries + lines with entity-scoped RLS."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_journal_rls"
down_revision: Union[str, None] = "002_accounts_rls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "journal_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_journal_entries_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_journal_entries")),
    )
    op.create_index(op.f("ix_journal_entries_entity_id"), "journal_entries", ["entity_id"])

    op.create_table(
        "journal_entry_lines",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("amount_kurus", sa.Integer(), nullable=False),
        sa.Column("side", sa.String(length=8), nullable=False),
        sa.Column("line_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_journal_entry_lines_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_journal_entry_lines_journal_entry_id_journal_entries"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name=op.f("fk_journal_entry_lines_account_id_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_journal_entry_lines")),
    )
    op.create_index(
        op.f("ix_journal_entry_lines_entity_id"), "journal_entry_lines", ["entity_id"]
    )
    op.create_index(
        op.f("ix_journal_entry_lines_journal_entry_id"),
        "journal_entry_lines",
        ["journal_entry_id"],
    )
    op.create_index(
        op.f("ix_journal_entry_lines_account_id"), "journal_entry_lines", ["account_id"]
    )

    for table in ("journal_entries", "journal_entry_lines"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY {table}_entity_isolation ON {table}
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
    for table in ("journal_entry_lines", "journal_entries"):
        op.execute(f"DROP POLICY IF EXISTS {table}_entity_isolation ON {table}")
    op.drop_index(op.f("ix_journal_entry_lines_account_id"), table_name="journal_entry_lines")
    op.drop_index(
        op.f("ix_journal_entry_lines_journal_entry_id"), table_name="journal_entry_lines"
    )
    op.drop_index(op.f("ix_journal_entry_lines_entity_id"), table_name="journal_entry_lines")
    op.drop_table("journal_entry_lines")
    op.drop_index(op.f("ix_journal_entries_entity_id"), table_name="journal_entries")
    op.drop_table("journal_entries")
