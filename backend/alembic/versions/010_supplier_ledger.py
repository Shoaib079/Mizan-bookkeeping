"""Supplier payables ledger table with entity-scoped RLS."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.payables_immutability import apply_payables_immutability

revision: str = "010_supplier_ledger"
down_revision: Union[str, None] = "009_suppliers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "supplier_ledger_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("supplier_id", sa.Uuid(), nullable=False),
        sa.Column("movement_date", sa.Date(), nullable=False),
        sa.Column(
            "movement_type",
            sa.Enum(
                "opening_balance",
                "adjustment",
                "invoice",
                "payment",
                "credit_note",
                name="supplier_movement_type",
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
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_supplier_ledger_entries_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["supplier_id"],
            ["suppliers.id"],
            name=op.f("fk_supplier_ledger_entries_supplier_id_suppliers"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_supplier_ledger_entries")),
    )
    op.create_index(
        op.f("ix_supplier_ledger_entries_entity_id"),
        "supplier_ledger_entries",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_supplier_ledger_entries_supplier_id"),
        "supplier_ledger_entries",
        ["supplier_id"],
    )

    op.execute("ALTER TABLE supplier_ledger_entries ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE supplier_ledger_entries FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY supplier_ledger_entries_entity_isolation ON supplier_ledger_entries
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
    apply_payables_immutability(bind)


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS supplier_ledger_entries_immutable ON supplier_ledger_entries"
    )
    op.execute("DROP FUNCTION IF EXISTS prevent_supplier_ledger_entry_mutation()")
    op.execute(
        "DROP POLICY IF EXISTS supplier_ledger_entries_entity_isolation "
        "ON supplier_ledger_entries"
    )
    op.drop_index(
        op.f("ix_supplier_ledger_entries_supplier_id"),
        table_name="supplier_ledger_entries",
    )
    op.drop_index(
        op.f("ix_supplier_ledger_entries_entity_id"),
        table_name="supplier_ledger_entries",
    )
    op.drop_table("supplier_ledger_entries")
    op.execute("DROP TYPE IF EXISTS supplier_movement_type")
