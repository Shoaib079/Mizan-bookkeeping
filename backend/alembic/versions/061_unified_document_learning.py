"""Unified document learning — invoice rules + correction audit."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "061_unified_document_learning"
down_revision: Union[str, None] = "060_staff_accrual_period"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "invoice_classification_rules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("match_token", sa.String(length=512), nullable=False),
        sa.Column("seller_vkn", sa.String(length=16), nullable=True),
        sa.Column("invoice_kind", sa.String(length=32), nullable=False),
        sa.Column("delivery_platform_id", sa.Uuid(), nullable=True),
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
            name=op.f("fk_invoice_classification_rules_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["delivery_platform_id"],
            ["delivery_platforms.id"],
            name=op.f(
                "fk_invoice_classification_rules_delivery_platform_id_delivery_platforms"
            ),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invoice_classification_rules")),
        sa.UniqueConstraint(
            "entity_id",
            "match_token",
            name="uq_invoice_classification_rules_entity_token",
        ),
    )
    op.create_index(
        op.f("ix_invoice_classification_rules_entity_id"),
        "invoice_classification_rules",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_invoice_classification_rules_seller_vkn"),
        "invoice_classification_rules",
        ["seller_vkn"],
    )
    op.create_index(
        op.f("ix_invoice_classification_rules_delivery_platform_id"),
        "invoice_classification_rules",
        ["delivery_platform_id"],
    )

    op.execute("ALTER TABLE invoice_classification_rules ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE invoice_classification_rules FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY invoice_classification_rules_entity_isolation
        ON invoice_classification_rules
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )

    op.create_table(
        "learning_correction_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("domain", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column("match_token", sa.String(length=512), nullable=True),
        sa.Column("field_name", sa.String(length=64), nullable=False),
        sa.Column("before_value", sa.Text(), nullable=True),
        sa.Column("after_value", sa.Text(), nullable=True),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_learning_correction_events_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_learning_correction_events")),
    )
    op.create_index(
        op.f("ix_learning_correction_events_entity_id"),
        "learning_correction_events",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_learning_correction_events_domain"),
        "learning_correction_events",
        ["domain"],
    )

    op.execute("ALTER TABLE learning_correction_events ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE learning_correction_events FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY learning_correction_events_entity_isolation
        ON learning_correction_events
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
        "DROP POLICY IF EXISTS learning_correction_events_entity_isolation "
        "ON learning_correction_events"
    )
    op.drop_index(
        op.f("ix_learning_correction_events_domain"),
        table_name="learning_correction_events",
    )
    op.drop_index(
        op.f("ix_learning_correction_events_entity_id"),
        table_name="learning_correction_events",
    )
    op.drop_table("learning_correction_events")

    op.execute(
        "DROP POLICY IF EXISTS invoice_classification_rules_entity_isolation "
        "ON invoice_classification_rules"
    )
    op.drop_index(
        op.f("ix_invoice_classification_rules_delivery_platform_id"),
        table_name="invoice_classification_rules",
    )
    op.drop_index(
        op.f("ix_invoice_classification_rules_seller_vkn"),
        table_name="invoice_classification_rules",
    )
    op.drop_index(
        op.f("ix_invoice_classification_rules_entity_id"),
        table_name="invoice_classification_rules",
    )
    op.drop_table("invoice_classification_rules")
