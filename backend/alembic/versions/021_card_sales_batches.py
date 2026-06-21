"""Card sales batches + settlement commission linkage (Decisions §13)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "021_card_sales_batches"
down_revision: Union[str, None] = "020_credit_card_money_accounts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "card_sales_batches",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("sales_date", sa.Date(), nullable=False),
        sa.Column("gross_amount_kurus", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_card_sales_batches_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_card_sales_batches_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_card_sales_batches")),
        sa.UniqueConstraint(
            "journal_entry_id", name="uq_card_sales_batches_journal_entry_id"
        ),
    )
    op.create_index(
        op.f("ix_card_sales_batches_entity_id"), "card_sales_batches", ["entity_id"]
    )
    op.create_index(
        op.f("ix_card_sales_batches_journal_entry_id"),
        "card_sales_batches",
        ["journal_entry_id"],
    )

    op.add_column(
        "pos_settlements",
        sa.Column("card_sales_batch_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "pos_settlements",
        sa.Column("commission_inferred", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_index(
        op.f("ix_pos_settlements_card_sales_batch_id"),
        "pos_settlements",
        ["card_sales_batch_id"],
    )
    op.create_foreign_key(
        op.f("fk_pos_settlements_card_sales_batch_id_card_sales_batches"),
        "pos_settlements",
        "card_sales_batches",
        ["card_sales_batch_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.execute("ALTER TABLE card_sales_batches ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE card_sales_batches FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY card_sales_batches_entity_isolation ON card_sales_batches
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
        "DROP POLICY IF EXISTS card_sales_batches_entity_isolation ON card_sales_batches"
    )
    op.drop_constraint(
        op.f("fk_pos_settlements_card_sales_batch_id_card_sales_batches"),
        "pos_settlements",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_pos_settlements_card_sales_batch_id"), table_name="pos_settlements"
    )
    op.drop_column("pos_settlements", "commission_inferred")
    op.drop_column("pos_settlements", "card_sales_batch_id")
    op.drop_index(
        op.f("ix_card_sales_batches_journal_entry_id"), table_name="card_sales_batches"
    )
    op.drop_index(
        op.f("ix_card_sales_batches_entity_id"), table_name="card_sales_batches"
    )
    op.drop_table("card_sales_batches")
