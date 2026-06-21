"""Credit card payment + bank fee GL classify (Phase 4)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "022_credit_card_payment_bank_fee_gl"
down_revision: Union[str, None] = "021_card_sales_batches"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "credit_card_payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("credit_card_money_account_id", sa.Uuid(), nullable=False),
        sa.Column("bank_money_account_id", sa.Uuid(), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("amount_kurus", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=False),
        sa.Column("bank_statement_line_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_credit_card_payments_entity_id_entities"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["credit_card_money_account_id"],
            ["money_accounts.id"],
            name=op.f("fk_credit_card_payments_credit_card_money_account_id_money_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["bank_money_account_id"],
            ["money_accounts.id"],
            name=op.f("fk_credit_card_payments_bank_money_account_id_money_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_credit_card_payments_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["bank_statement_line_id"],
            ["bank_statement_lines.id"],
            name=op.f("fk_credit_card_payments_bank_statement_line_id_bank_statement_lines"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_credit_card_payments")),
        sa.UniqueConstraint(
            "journal_entry_id", name="uq_credit_card_payments_journal_entry_id"
        ),
    )
    op.create_index(
        op.f("ix_credit_card_payments_entity_id"),
        "credit_card_payments",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_credit_card_payments_credit_card_money_account_id"),
        "credit_card_payments",
        ["credit_card_money_account_id"],
    )
    op.create_index(
        op.f("ix_credit_card_payments_bank_money_account_id"),
        "credit_card_payments",
        ["bank_money_account_id"],
    )
    op.create_index(
        op.f("ix_credit_card_payments_journal_entry_id"),
        "credit_card_payments",
        ["journal_entry_id"],
    )
    op.create_index(
        op.f("ix_credit_card_payments_bank_statement_line_id"),
        "credit_card_payments",
        ["bank_statement_line_id"],
    )

    op.add_column(
        "bank_statement_lines",
        sa.Column("credit_card_payment_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        op.f("ix_bank_statement_lines_credit_card_payment_id"),
        "bank_statement_lines",
        ["credit_card_payment_id"],
    )
    op.create_foreign_key(
        op.f("fk_bank_statement_lines_credit_card_payment_id_credit_card_payments"),
        "bank_statement_lines",
        "credit_card_payments",
        ["credit_card_payment_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.execute("ALTER TABLE credit_card_payments ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE credit_card_payments FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY credit_card_payments_entity_isolation ON credit_card_payments
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
        "DROP POLICY IF EXISTS credit_card_payments_entity_isolation ON credit_card_payments"
    )
    op.drop_constraint(
        op.f("fk_bank_statement_lines_credit_card_payment_id_credit_card_payments"),
        "bank_statement_lines",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_bank_statement_lines_credit_card_payment_id"),
        table_name="bank_statement_lines",
    )
    op.drop_column("bank_statement_lines", "credit_card_payment_id")
    op.drop_index(
        op.f("ix_credit_card_payments_bank_statement_line_id"),
        table_name="credit_card_payments",
    )
    op.drop_index(
        op.f("ix_credit_card_payments_journal_entry_id"),
        table_name="credit_card_payments",
    )
    op.drop_index(
        op.f("ix_credit_card_payments_bank_money_account_id"),
        table_name="credit_card_payments",
    )
    op.drop_index(
        op.f("ix_credit_card_payments_credit_card_money_account_id"),
        table_name="credit_card_payments",
    )
    op.drop_index(
        op.f("ix_credit_card_payments_entity_id"),
        table_name="credit_card_payments",
    )
    op.drop_table("credit_card_payments")
