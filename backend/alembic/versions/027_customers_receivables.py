"""Customers + receivables ledger; per-customer opening balances (Decisions §10)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.receivables_immutability import apply_receivables_immutability

revision: str = "027_customers_receivables"
down_revision: Union[str, None] = "026_partners"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "customers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=512), nullable=False),
        sa.Column("identifier", sa.String(length=64), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("notes", sa.String(length=2048), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_customers_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customers")),
    )
    op.create_index(op.f("ix_customers_entity_id"), "customers", ["entity_id"])

    op.create_table(
        "customer_ledger_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("movement_date", sa.Date(), nullable=False),
        sa.Column(
            "movement_type",
            sa.Enum(
                "opening_balance",
                "adjustment",
                "credit_sale",
                "payment_received",
                name="customer_movement_type",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("amount_kurus", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("reference_type", sa.String(length=64), nullable=True),
        sa.Column("reference_id", sa.Uuid(), nullable=True),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            name=op.f("fk_customer_ledger_entries_customer_id_customers"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_customer_ledger_entries_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_customer_ledger_entries_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customer_ledger_entries")),
    )
    op.create_index(
        op.f("ix_customer_ledger_entries_entity_id"),
        "customer_ledger_entries",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_customer_ledger_entries_customer_id"),
        "customer_ledger_entries",
        ["customer_id"],
    )
    op.create_index(
        op.f("ix_customer_ledger_entries_journal_entry_id"),
        "customer_ledger_entries",
        ["journal_entry_id"],
    )

    op.execute("ALTER TABLE customers ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE customers FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY customers_entity_isolation ON customers
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )

    op.execute("ALTER TABLE customer_ledger_entries ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE customer_ledger_entries FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY customer_ledger_entries_entity_isolation ON customer_ledger_entries
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )

    bind = op.get_bind()
    apply_receivables_immutability(bind)

    op.add_column(
        "bank_statement_lines",
        sa.Column("customer_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "bank_statement_lines",
        sa.Column("customer_ledger_entry_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        op.f("ix_bank_statement_lines_customer_id"),
        "bank_statement_lines",
        ["customer_id"],
    )
    op.create_index(
        op.f("ix_bank_statement_lines_customer_ledger_entry_id"),
        "bank_statement_lines",
        ["customer_ledger_entry_id"],
    )
    op.create_foreign_key(
        op.f("fk_bank_statement_lines_customer_id_customers"),
        "bank_statement_lines",
        "customers",
        ["customer_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_bank_statement_lines_customer_ledger_entry_id_customer_ledger_entries"),
        "bank_statement_lines",
        "customer_ledger_entries",
        ["customer_ledger_entry_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_bank_statement_lines_customer_ledger_entry_id_customer_ledger_entries"),
        "bank_statement_lines",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_bank_statement_lines_customer_id_customers"),
        "bank_statement_lines",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_bank_statement_lines_customer_ledger_entry_id"),
        table_name="bank_statement_lines",
    )
    op.drop_index(
        op.f("ix_bank_statement_lines_customer_id"),
        table_name="bank_statement_lines",
    )
    op.drop_column("bank_statement_lines", "customer_ledger_entry_id")
    op.drop_column("bank_statement_lines", "customer_id")

    op.execute(
        "DROP TRIGGER IF EXISTS customer_ledger_entries_immutable ON customer_ledger_entries"
    )
    op.execute("DROP FUNCTION IF EXISTS prevent_customer_ledger_entry_mutation()")
    op.execute(
        "DROP POLICY IF EXISTS customer_ledger_entries_entity_isolation ON customer_ledger_entries"
    )
    op.execute("DROP POLICY IF EXISTS customers_entity_isolation ON customers")
    op.drop_index(
        op.f("ix_customer_ledger_entries_journal_entry_id"),
        table_name="customer_ledger_entries",
    )
    op.drop_index(
        op.f("ix_customer_ledger_entries_customer_id"),
        table_name="customer_ledger_entries",
    )
    op.drop_index(
        op.f("ix_customer_ledger_entries_entity_id"),
        table_name="customer_ledger_entries",
    )
    op.drop_table("customer_ledger_entries")
    op.execute("DROP TYPE IF EXISTS customer_movement_type")
    op.drop_index(op.f("ix_customers_entity_id"), table_name="customers")
    op.drop_table("customers")
