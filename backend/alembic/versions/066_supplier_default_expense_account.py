"""Supplier expense account learning rules — counted confirmations."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "066_supplier_default_expense_account"
down_revision: Union[str, None] = "065_delivery_report_period_dates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "supplier_expense_account_rules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("supplier_id", sa.Uuid(), nullable=False),
        sa.Column("expense_account_id", sa.Uuid(), nullable=False),
        sa.Column("confirmation_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("correction_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "confirmations_since_correction",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_supplier_expense_account_rules_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["supplier_id"],
            ["suppliers.id"],
            name=op.f("fk_supplier_expense_account_rules_supplier_id_suppliers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["expense_account_id"],
            ["accounts.id"],
            name=op.f("fk_supplier_expense_account_rules_expense_account_id_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_supplier_expense_account_rules")),
        sa.UniqueConstraint(
            "entity_id",
            "supplier_id",
            name="uq_supplier_expense_account_rules_entity_supplier",
        ),
    )
    op.create_index(
        op.f("ix_supplier_expense_account_rules_entity_id"),
        "supplier_expense_account_rules",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_supplier_expense_account_rules_supplier_id"),
        "supplier_expense_account_rules",
        ["supplier_id"],
    )
    op.create_index(
        op.f("ix_supplier_expense_account_rules_expense_account_id"),
        "supplier_expense_account_rules",
        ["expense_account_id"],
    )

    op.execute("ALTER TABLE supplier_expense_account_rules ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE supplier_expense_account_rules FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY supplier_expense_account_rules_entity_isolation
        ON supplier_expense_account_rules
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
        "DROP POLICY IF EXISTS supplier_expense_account_rules_entity_isolation "
        "ON supplier_expense_account_rules"
    )
    op.drop_index(
        op.f("ix_supplier_expense_account_rules_expense_account_id"),
        table_name="supplier_expense_account_rules",
    )
    op.drop_index(
        op.f("ix_supplier_expense_account_rules_supplier_id"),
        table_name="supplier_expense_account_rules",
    )
    op.drop_index(
        op.f("ix_supplier_expense_account_rules_entity_id"),
        table_name="supplier_expense_account_rules",
    )
    op.drop_table("supplier_expense_account_rules")
