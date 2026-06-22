"""POS daily-summary photo intake table with entity RLS (Decisions §9)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "028_pos_daily_summaries"
down_revision: Union[str, None] = "027_customers_receivables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pos_daily_summaries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("file_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("summary_date", sa.Date(), nullable=True),
        sa.Column("cash_kurus", sa.Integer(), nullable=False),
        sa.Column("card_kurus", sa.Integer(), nullable=False),
        sa.Column("total_kurus", sa.Integer(), nullable=False),
        sa.Column("confirmed_cash_kurus", sa.Integer(), nullable=True),
        sa.Column("confirmed_card_kurus", sa.Integer(), nullable=True),
        sa.Column(
            "extraction_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("review_reason", sa.String(length=512), nullable=True),
        sa.Column("money_account_id", sa.Uuid(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_by", sa.Uuid(), nullable=True),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("posted_by", sa.Uuid(), nullable=True),
        sa.Column("card_sales_batch_id", sa.Uuid(), nullable=True),
        sa.Column("cash_movement_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["card_sales_batch_id"],
            ["card_sales_batches.id"],
            name=op.f("fk_pos_daily_summaries_card_sales_batch_id_card_sales_batches"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["cash_movement_id"],
            ["cash_movements.id"],
            name=op.f("fk_pos_daily_summaries_cash_movement_id_cash_movements"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_pos_daily_summaries_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["money_account_id"],
            ["money_accounts.id"],
            name=op.f("fk_pos_daily_summaries_money_account_id_money_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pos_daily_summaries")),
        sa.UniqueConstraint(
            "entity_id",
            "file_fingerprint",
            name="uq_pos_daily_summaries_entity_fingerprint",
        ),
    )
    op.create_index(
        op.f("ix_pos_daily_summaries_entity_id"),
        "pos_daily_summaries",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_pos_daily_summaries_file_fingerprint"),
        "pos_daily_summaries",
        ["file_fingerprint"],
    )
    op.create_index(
        op.f("ix_pos_daily_summaries_money_account_id"),
        "pos_daily_summaries",
        ["money_account_id"],
    )
    op.create_index(
        op.f("ix_pos_daily_summaries_card_sales_batch_id"),
        "pos_daily_summaries",
        ["card_sales_batch_id"],
    )
    op.create_index(
        op.f("ix_pos_daily_summaries_cash_movement_id"),
        "pos_daily_summaries",
        ["cash_movement_id"],
    )

    op.execute("ALTER TABLE pos_daily_summaries ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE pos_daily_summaries FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY pos_daily_summaries_entity_isolation ON pos_daily_summaries
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
        "DROP POLICY IF EXISTS pos_daily_summaries_entity_isolation ON pos_daily_summaries"
    )
    op.drop_index(
        op.f("ix_pos_daily_summaries_cash_movement_id"), table_name="pos_daily_summaries"
    )
    op.drop_index(
        op.f("ix_pos_daily_summaries_card_sales_batch_id"), table_name="pos_daily_summaries"
    )
    op.drop_index(
        op.f("ix_pos_daily_summaries_money_account_id"), table_name="pos_daily_summaries"
    )
    op.drop_index(
        op.f("ix_pos_daily_summaries_file_fingerprint"), table_name="pos_daily_summaries"
    )
    op.drop_index(op.f("ix_pos_daily_summaries_entity_id"), table_name="pos_daily_summaries")
    op.drop_table("pos_daily_summaries")
