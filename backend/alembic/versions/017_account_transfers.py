"""Account transfers + statement line transfer FK (Decisions §12)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "017_account_transfers"
down_revision: Union[str, None] = "016_bank_statements"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "account_transfers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("from_money_account_id", sa.Uuid(), nullable=False),
        sa.Column("to_money_account_id", sa.Uuid(), nullable=False),
        sa.Column("amount_kurus", sa.Integer(), nullable=False),
        sa.Column("transfer_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=False),
        sa.Column("from_statement_line_id", sa.Uuid(), nullable=True),
        sa.Column("to_statement_line_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_account_transfers_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["from_money_account_id"],
            ["money_accounts.id"],
            name=op.f("fk_account_transfers_from_money_account_id_money_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["to_money_account_id"],
            ["money_accounts.id"],
            name=op.f("fk_account_transfers_to_money_account_id_money_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_account_transfers_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["from_statement_line_id"],
            ["bank_statement_lines.id"],
            name=op.f(
                "fk_account_transfers_from_statement_line_id_bank_statement_lines"
            ),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["to_statement_line_id"],
            ["bank_statement_lines.id"],
            name=op.f(
                "fk_account_transfers_to_statement_line_id_bank_statement_lines"
            ),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_account_transfers")),
        sa.UniqueConstraint(
            "journal_entry_id", name="uq_account_transfers_journal_entry_id"
        ),
    )
    op.create_index(
        op.f("ix_account_transfers_entity_id"), "account_transfers", ["entity_id"]
    )
    op.create_index(
        op.f("ix_account_transfers_from_money_account_id"),
        "account_transfers",
        ["from_money_account_id"],
    )
    op.create_index(
        op.f("ix_account_transfers_to_money_account_id"),
        "account_transfers",
        ["to_money_account_id"],
    )
    op.create_index(
        op.f("ix_account_transfers_journal_entry_id"),
        "account_transfers",
        ["journal_entry_id"],
    )
    op.create_index(
        op.f("ix_account_transfers_from_statement_line_id"),
        "account_transfers",
        ["from_statement_line_id"],
    )
    op.create_index(
        op.f("ix_account_transfers_to_statement_line_id"),
        "account_transfers",
        ["to_statement_line_id"],
    )

    op.add_column(
        "bank_statement_lines",
        sa.Column("account_transfer_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        op.f("ix_bank_statement_lines_account_transfer_id"),
        "bank_statement_lines",
        ["account_transfer_id"],
    )
    op.create_foreign_key(
        op.f("fk_bank_statement_lines_account_transfer_id_account_transfers"),
        "bank_statement_lines",
        "account_transfers",
        ["account_transfer_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.execute("ALTER TABLE account_transfers ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE account_transfers FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY account_transfers_entity_isolation ON account_transfers
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
        "DROP POLICY IF EXISTS account_transfers_entity_isolation ON account_transfers"
    )
    op.drop_constraint(
        op.f("fk_bank_statement_lines_account_transfer_id_account_transfers"),
        "bank_statement_lines",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_bank_statement_lines_account_transfer_id"),
        table_name="bank_statement_lines",
    )
    op.drop_column("bank_statement_lines", "account_transfer_id")
    op.drop_index(
        op.f("ix_account_transfers_to_statement_line_id"), table_name="account_transfers"
    )
    op.drop_index(
        op.f("ix_account_transfers_from_statement_line_id"),
        table_name="account_transfers",
    )
    op.drop_index(
        op.f("ix_account_transfers_journal_entry_id"), table_name="account_transfers"
    )
    op.drop_index(
        op.f("ix_account_transfers_to_money_account_id"), table_name="account_transfers"
    )
    op.drop_index(
        op.f("ix_account_transfers_from_money_account_id"),
        table_name="account_transfers",
    )
    op.drop_index(op.f("ix_account_transfers_entity_id"), table_name="account_transfers")
    op.drop_table("account_transfers")
