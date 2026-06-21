"""POS settlements + statement line pos_settlement FK (Decisions §13)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "019_pos_settlements"
down_revision: Union[str, None] = "018_statement_line_needs_review"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pos_settlements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("money_account_id", sa.Uuid(), nullable=False),
        sa.Column("settlement_date", sa.Date(), nullable=False),
        sa.Column("amount_kurus", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=False),
        sa.Column("reference_type", sa.String(length=64), nullable=True),
        sa.Column("reference_id", sa.Uuid(), nullable=True),
        sa.Column("bank_statement_line_id", sa.Uuid(), nullable=True),
        sa.Column("commission_kurus", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_pos_settlements_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["money_account_id"],
            ["money_accounts.id"],
            name=op.f("fk_pos_settlements_money_account_id_money_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_pos_settlements_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["bank_statement_line_id"],
            ["bank_statement_lines.id"],
            name=op.f(
                "fk_pos_settlements_bank_statement_line_id_bank_statement_lines"
            ),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pos_settlements")),
        sa.UniqueConstraint(
            "journal_entry_id", name="uq_pos_settlements_journal_entry_id"
        ),
    )
    op.create_index(
        op.f("ix_pos_settlements_entity_id"), "pos_settlements", ["entity_id"]
    )
    op.create_index(
        op.f("ix_pos_settlements_money_account_id"),
        "pos_settlements",
        ["money_account_id"],
    )
    op.create_index(
        op.f("ix_pos_settlements_journal_entry_id"),
        "pos_settlements",
        ["journal_entry_id"],
    )
    op.create_index(
        op.f("ix_pos_settlements_bank_statement_line_id"),
        "pos_settlements",
        ["bank_statement_line_id"],
    )

    op.add_column(
        "bank_statement_lines",
        sa.Column("pos_settlement_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        op.f("ix_bank_statement_lines_pos_settlement_id"),
        "bank_statement_lines",
        ["pos_settlement_id"],
    )
    op.create_foreign_key(
        op.f("fk_bank_statement_lines_pos_settlement_id_pos_settlements"),
        "bank_statement_lines",
        "pos_settlements",
        ["pos_settlement_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.execute("ALTER TABLE pos_settlements ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE pos_settlements FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY pos_settlements_entity_isolation ON pos_settlements
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
        "DROP POLICY IF EXISTS pos_settlements_entity_isolation ON pos_settlements"
    )
    op.drop_constraint(
        op.f("fk_bank_statement_lines_pos_settlement_id_pos_settlements"),
        "bank_statement_lines",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_bank_statement_lines_pos_settlement_id"),
        table_name="bank_statement_lines",
    )
    op.drop_column("bank_statement_lines", "pos_settlement_id")
    op.drop_index(
        op.f("ix_pos_settlements_bank_statement_line_id"), table_name="pos_settlements"
    )
    op.drop_index(
        op.f("ix_pos_settlements_journal_entry_id"), table_name="pos_settlements"
    )
    op.drop_index(
        op.f("ix_pos_settlements_money_account_id"), table_name="pos_settlements"
    )
    op.drop_index(op.f("ix_pos_settlements_entity_id"), table_name="pos_settlements")
    op.drop_table("pos_settlements")
