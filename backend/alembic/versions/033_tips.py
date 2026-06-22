"""Tips pass-through accrual and payout (Decisions §9)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "033_tips"
down_revision: Union[str, None] = "032_delivery_platforms_managed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tip_accruals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("accrual_date", sa.Date(), nullable=False),
        sa.Column("amount_kurus", sa.Integer(), nullable=False),
        sa.Column(
            "source",
            sa.Enum("card", "cash", name="tip_accrual_source", native_enum=False, length=8),
            nullable=False,
        ),
        sa.Column("money_account_id", sa.Uuid(), nullable=True),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_tip_accruals_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["money_account_id"],
            ["money_accounts.id"],
            name=op.f("fk_tip_accruals_money_account_id_money_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_tip_accruals_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tip_accruals")),
        sa.UniqueConstraint("journal_entry_id", name="uq_tip_accruals_journal_entry_id"),
    )
    op.create_index(op.f("ix_tip_accruals_entity_id"), "tip_accruals", ["entity_id"])
    op.create_index(
        op.f("ix_tip_accruals_money_account_id"), "tip_accruals", ["money_account_id"]
    )
    op.create_index(
        op.f("ix_tip_accruals_journal_entry_id"), "tip_accruals", ["journal_entry_id"]
    )

    op.create_table(
        "tip_payouts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("payout_date", sa.Date(), nullable=False),
        sa.Column("amount_kurus", sa.Integer(), nullable=False),
        sa.Column("money_account_id", sa.Uuid(), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_tip_payouts_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["money_account_id"],
            ["money_accounts.id"],
            name=op.f("fk_tip_payouts_money_account_id_money_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_tip_payouts_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tip_payouts")),
        sa.UniqueConstraint("journal_entry_id", name="uq_tip_payouts_journal_entry_id"),
    )
    op.create_index(op.f("ix_tip_payouts_entity_id"), "tip_payouts", ["entity_id"])
    op.create_index(
        op.f("ix_tip_payouts_money_account_id"), "tip_payouts", ["money_account_id"]
    )
    op.create_index(
        op.f("ix_tip_payouts_journal_entry_id"), "tip_payouts", ["journal_entry_id"]
    )

    op.execute("ALTER TABLE tip_accruals ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tip_accruals FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tip_accruals_entity_isolation ON tip_accruals
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )

    op.execute("ALTER TABLE tip_payouts ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tip_payouts FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tip_payouts_entity_isolation ON tip_payouts
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )

    op.execute(
        """
        INSERT INTO accounts (
            id, entity_id, code, name_en, name_tr, account_type, normal_balance,
            accepts_opening_balance, is_active, created_at
        )
        SELECT
            gen_random_uuid(),
            e.id,
            '2260',
            'Tips Payable',
            'Ödenecek Bahşişler',
            'liability',
            'credit',
            true,
            true,
            NOW()
        FROM entities e
        WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.entity_id = e.id)
        AND NOT EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.entity_id = e.id AND a.code = '2260'
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tip_payouts_entity_isolation ON tip_payouts")
    op.execute("DROP POLICY IF EXISTS tip_accruals_entity_isolation ON tip_accruals")
    op.drop_index(op.f("ix_tip_payouts_journal_entry_id"), table_name="tip_payouts")
    op.drop_index(op.f("ix_tip_payouts_money_account_id"), table_name="tip_payouts")
    op.drop_index(op.f("ix_tip_payouts_entity_id"), table_name="tip_payouts")
    op.drop_table("tip_payouts")
    op.execute("DROP TYPE IF EXISTS tip_accrual_source")
    op.drop_index(op.f("ix_tip_accruals_journal_entry_id"), table_name="tip_accruals")
    op.drop_index(op.f("ix_tip_accruals_money_account_id"), table_name="tip_accruals")
    op.drop_index(op.f("ix_tip_accruals_entity_id"), table_name="tip_accruals")
    op.drop_table("tip_accruals")
