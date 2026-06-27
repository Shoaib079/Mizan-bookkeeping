"""Add statement classification learning rules."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "054_statement_classification_rules"
down_revision: Union[str, None] = "053_bank_import_csv_options"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "statement_classification_rules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("match_token", sa.String(length=512), nullable=False),
        sa.Column(
            "classification",
            sa.Enum(
                "unclassified",
                "supplier_payment",
                "transfer",
                "pos_settlement",
                "delivery_settlement",
                "bank_fee",
                "rent_utility",
                "credit_card_payment",
                "customer_payment",
                "unknown",
                name="statement_line_classification",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("supplier_id", sa.Uuid(), nullable=True),
        sa.Column("confirmation_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_statement_classification_rules_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["supplier_id"],
            ["suppliers.id"],
            name=op.f("fk_statement_classification_rules_supplier_id_suppliers"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_statement_classification_rules")),
        sa.UniqueConstraint(
            "entity_id",
            "match_token",
            name="uq_statement_classification_rules_entity_token",
        ),
    )
    op.create_index(
        op.f("ix_statement_classification_rules_entity_id"),
        "statement_classification_rules",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_statement_classification_rules_supplier_id"),
        "statement_classification_rules",
        ["supplier_id"],
    )

    op.execute("ALTER TABLE statement_classification_rules ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE statement_classification_rules FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY statement_classification_rules_entity_isolation
        ON statement_classification_rules
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
        "DROP POLICY IF EXISTS statement_classification_rules_entity_isolation "
        "ON statement_classification_rules"
    )
    op.drop_index(
        op.f("ix_statement_classification_rules_supplier_id"),
        table_name="statement_classification_rules",
    )
    op.drop_index(
        op.f("ix_statement_classification_rules_entity_id"),
        table_name="statement_classification_rules",
    )
    op.drop_table("statement_classification_rules")
