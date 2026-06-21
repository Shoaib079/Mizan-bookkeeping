"""Bank statements + statement lines with entity RLS."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "016_bank_statements"
down_revision: Union[str, None] = "015_money_accounts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bank_statements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("money_account_id", sa.Uuid(), nullable=False),
        sa.Column("file_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("original_filename", sa.String(length=512), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("line_count", sa.Integer(), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_bank_statements_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["money_account_id"],
            ["money_accounts.id"],
            name=op.f("fk_bank_statements_money_account_id_money_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bank_statements")),
        sa.UniqueConstraint(
            "entity_id",
            "file_fingerprint",
            name="uq_bank_statements_entity_fingerprint",
        ),
    )
    op.create_index(
        op.f("ix_bank_statements_entity_id"), "bank_statements", ["entity_id"]
    )
    op.create_index(
        op.f("ix_bank_statements_money_account_id"),
        "bank_statements",
        ["money_account_id"],
    )
    op.create_index(
        op.f("ix_bank_statements_file_fingerprint"),
        "bank_statements",
        ["file_fingerprint"],
    )

    op.create_table(
        "bank_statement_lines",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("statement_id", sa.Uuid(), nullable=False),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("amount_kurus", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("reference", sa.String(length=255), nullable=True),
        sa.Column(
            "classification",
            sa.Enum(
                "unclassified",
                "supplier_payment",
                "bank_fee",
                "unknown",
                name="statement_line_classification",
                native_enum=False,
                length=32,
            ),
            nullable=False,
            server_default="unclassified",
        ),
        sa.Column(
            "status",
            sa.Enum(
                "imported",
                "classified",
                "posted",
                "linked",
                name="statement_line_status",
                native_enum=False,
                length=16,
            ),
            nullable=False,
            server_default="imported",
        ),
        sa.Column("supplier_id", sa.Uuid(), nullable=True),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=True),
        sa.Column("supplier_ledger_entry_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_bank_statement_lines_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["statement_id"],
            ["bank_statements.id"],
            name=op.f("fk_bank_statement_lines_statement_id_bank_statements"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["supplier_id"],
            ["suppliers.id"],
            name=op.f("fk_bank_statement_lines_supplier_id_suppliers"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_bank_statement_lines_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["supplier_ledger_entry_id"],
            ["supplier_ledger_entries.id"],
            name=op.f(
                "fk_bank_statement_lines_supplier_ledger_entry_id_supplier_ledger_entries"
            ),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bank_statement_lines")),
    )
    op.create_index(
        op.f("ix_bank_statement_lines_entity_id"),
        "bank_statement_lines",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_bank_statement_lines_statement_id"),
        "bank_statement_lines",
        ["statement_id"],
    )
    op.create_index(
        op.f("ix_bank_statement_lines_supplier_id"),
        "bank_statement_lines",
        ["supplier_id"],
    )
    op.create_index(
        op.f("ix_bank_statement_lines_journal_entry_id"),
        "bank_statement_lines",
        ["journal_entry_id"],
    )
    op.create_index(
        op.f("ix_bank_statement_lines_supplier_ledger_entry_id"),
        "bank_statement_lines",
        ["supplier_ledger_entry_id"],
    )

    for table in ("bank_statements", "bank_statement_lines"):
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
    for table in ("bank_statement_lines", "bank_statements"):
        op.execute(f"DROP POLICY IF EXISTS {table}_entity_isolation ON {table}")
    op.drop_index(
        op.f("ix_bank_statement_lines_supplier_ledger_entry_id"),
        table_name="bank_statement_lines",
    )
    op.drop_index(
        op.f("ix_bank_statement_lines_journal_entry_id"),
        table_name="bank_statement_lines",
    )
    op.drop_index(
        op.f("ix_bank_statement_lines_supplier_id"),
        table_name="bank_statement_lines",
    )
    op.drop_index(
        op.f("ix_bank_statement_lines_statement_id"),
        table_name="bank_statement_lines",
    )
    op.drop_index(
        op.f("ix_bank_statement_lines_entity_id"),
        table_name="bank_statement_lines",
    )
    op.drop_table("bank_statement_lines")
    op.drop_index(
        op.f("ix_bank_statements_file_fingerprint"), table_name="bank_statements"
    )
    op.drop_index(
        op.f("ix_bank_statements_money_account_id"), table_name="bank_statements"
    )
    op.drop_index(op.f("ix_bank_statements_entity_id"), table_name="bank_statements")
    op.drop_table("bank_statements")
