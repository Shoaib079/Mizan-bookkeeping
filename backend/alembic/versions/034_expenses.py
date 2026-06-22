"""Daily expenses + item spelling tolerance (Decisions §7, §22)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "034_expenses"
down_revision: Union[str, None] = "033_tips"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "expense_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("canonical_name", sa.String(length=512), nullable=False),
        sa.Column("canonical_name_normalized", sa.String(length=512), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_expense_items_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_expense_items")),
        sa.UniqueConstraint(
            "entity_id",
            "canonical_name_normalized",
            name="uq_expense_items_entity_canonical_normalized",
        ),
    )
    op.create_index(
        op.f("ix_expense_items_entity_id"), "expense_items", ["entity_id"]
    )
    op.create_index(
        op.f("ix_expense_items_canonical_name_normalized"),
        "expense_items",
        ["canonical_name_normalized"],
    )

    op.create_table(
        "expense_item_aliases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("alias_normalized", sa.String(length=512), nullable=False),
        sa.Column("expense_item_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_expense_item_aliases_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["expense_item_id"],
            ["expense_items.id"],
            name=op.f("fk_expense_item_aliases_expense_item_id_expense_items"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_expense_item_aliases")),
        sa.UniqueConstraint(
            "entity_id",
            "alias_normalized",
            name="uq_expense_item_aliases_entity_alias",
        ),
    )
    op.create_index(
        op.f("ix_expense_item_aliases_entity_id"), "expense_item_aliases", ["entity_id"]
    )
    op.create_index(
        op.f("ix_expense_item_aliases_alias_normalized"),
        "expense_item_aliases",
        ["alias_normalized"],
    )
    op.create_index(
        op.f("ix_expense_item_aliases_expense_item_id"),
        "expense_item_aliases",
        ["expense_item_id"],
    )

    op.create_table(
        "expense_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("amount_kurus", sa.Integer(), nullable=False),
        sa.Column("expense_account_id", sa.Uuid(), nullable=False),
        sa.Column("money_account_id", sa.Uuid(), nullable=False),
        sa.Column("written_item_description", sa.String(length=512), nullable=True),
        sa.Column("expense_item_id", sa.Uuid(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "needs_review",
                "posted",
                name="expense_entry_status",
                native_enum=False,
                length=16,
            ),
            nullable=False,
        ),
        sa.Column(
            "has_source_document",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("notes", sa.String(length=512), nullable=True),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=True),
        sa.Column("bank_statement_line_id", sa.Uuid(), nullable=True),
        sa.Column("review_reason", sa.String(length=512), nullable=True),
        sa.Column("candidate_expense_item_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_expense_entries_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["expense_account_id"],
            ["accounts.id"],
            name=op.f("fk_expense_entries_expense_account_id_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["money_account_id"],
            ["money_accounts.id"],
            name=op.f("fk_expense_entries_money_account_id_money_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["expense_item_id"],
            ["expense_items.id"],
            name=op.f("fk_expense_entries_expense_item_id_expense_items"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_expense_entries_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["bank_statement_line_id"],
            ["bank_statement_lines.id"],
            name=op.f("fk_expense_entries_bank_statement_line_id_bank_statement_lines"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["candidate_expense_item_id"],
            ["expense_items.id"],
            name=op.f(
                "fk_expense_entries_candidate_expense_item_id_expense_items"
            ),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_expense_entries")),
        sa.UniqueConstraint(
            "journal_entry_id", name="uq_expense_entries_journal_entry_id"
        ),
    )
    op.create_index(
        op.f("ix_expense_entries_entity_id"), "expense_entries", ["entity_id"]
    )
    op.create_index(
        op.f("ix_expense_entries_expense_account_id"),
        "expense_entries",
        ["expense_account_id"],
    )
    op.create_index(
        op.f("ix_expense_entries_money_account_id"),
        "expense_entries",
        ["money_account_id"],
    )
    op.create_index(
        op.f("ix_expense_entries_expense_item_id"),
        "expense_entries",
        ["expense_item_id"],
    )
    op.create_index(
        op.f("ix_expense_entries_journal_entry_id"),
        "expense_entries",
        ["journal_entry_id"],
    )
    op.create_index(
        op.f("ix_expense_entries_bank_statement_line_id"),
        "expense_entries",
        ["bank_statement_line_id"],
    )
    op.create_index(
        op.f("ix_expense_entries_candidate_expense_item_id"),
        "expense_entries",
        ["candidate_expense_item_id"],
    )

    op.add_column(
        "bank_statement_lines",
        sa.Column("expense_entry_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_bank_statement_lines_expense_entry_id_expense_entries"),
        "bank_statement_lines",
        "expense_entries",
        ["expense_entry_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        op.f("ix_bank_statement_lines_expense_entry_id"),
        "bank_statement_lines",
        ["expense_entry_id"],
    )

    for table in ("expense_items", "expense_item_aliases", "expense_entries"):
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
    op.drop_index(
        op.f("ix_bank_statement_lines_expense_entry_id"),
        table_name="bank_statement_lines",
    )
    op.drop_constraint(
        op.f("fk_bank_statement_lines_expense_entry_id_expense_entries"),
        "bank_statement_lines",
        type_="foreignkey",
    )
    op.drop_column("bank_statement_lines", "expense_entry_id")

    for table in ("expense_entries", "expense_item_aliases", "expense_items"):
        op.execute(f"DROP POLICY IF EXISTS {table}_entity_isolation ON {table}")

    op.drop_index(
        op.f("ix_expense_entries_candidate_expense_item_id"), table_name="expense_entries"
    )
    op.drop_index(
        op.f("ix_expense_entries_bank_statement_line_id"), table_name="expense_entries"
    )
    op.drop_index(
        op.f("ix_expense_entries_journal_entry_id"), table_name="expense_entries"
    )
    op.drop_index(
        op.f("ix_expense_entries_expense_item_id"), table_name="expense_entries"
    )
    op.drop_index(
        op.f("ix_expense_entries_money_account_id"), table_name="expense_entries"
    )
    op.drop_index(
        op.f("ix_expense_entries_expense_account_id"), table_name="expense_entries"
    )
    op.drop_index(op.f("ix_expense_entries_entity_id"), table_name="expense_entries")
    op.drop_table("expense_entries")
    op.execute("DROP TYPE IF EXISTS expense_entry_status")

    op.drop_index(
        op.f("ix_expense_item_aliases_expense_item_id"),
        table_name="expense_item_aliases",
    )
    op.drop_index(
        op.f("ix_expense_item_aliases_alias_normalized"),
        table_name="expense_item_aliases",
    )
    op.drop_index(
        op.f("ix_expense_item_aliases_entity_id"), table_name="expense_item_aliases"
    )
    op.drop_table("expense_item_aliases")

    op.drop_index(
        op.f("ix_expense_items_canonical_name_normalized"), table_name="expense_items"
    )
    op.drop_index(op.f("ix_expense_items_entity_id"), table_name="expense_items")
    op.drop_table("expense_items")
