"""Tips: expense not liability — drop tip subsystem, gross POS revenue (Slice A).

Reverses 033_tips and 044_pos_daily_summary_tips. Removes the Tips Payable
liability subsystem (tip_accruals / tip_payouts tables, the 2260 account) and the
POS tip carve-out column. Guarded: aborts if any tip rows or 2260 postings exist
(pre-launch there are none; real data must be reversed via the posting boundary,
never hard-deleted).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "045_tips_expense_not_liability"
down_revision: Union[str, None] = "044_pos_daily_summary_tips"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    accrual_count = bind.execute(sa.text("SELECT count(*) FROM tip_accruals")).scalar() or 0
    payout_count = bind.execute(sa.text("SELECT count(*) FROM tip_payouts")).scalar() or 0
    posting_count = (
        bind.execute(
            sa.text(
                """
                SELECT count(*)
                FROM journal_entry_lines jel
                JOIN accounts a ON a.id = jel.account_id
                WHERE a.code = '2260'
                """
            )
        ).scalar()
        or 0
    )
    if accrual_count or payout_count or posting_count:
        raise RuntimeError(
            "Refusing to drop Tips Payable subsystem: existing tip rows or 2260 "
            f"postings found (accruals={accrual_count}, payouts={payout_count}, "
            f"2260_lines={posting_count}). Reverse them via the posting boundary first."
        )

    # Seed 5700 Tips Expense for existing entities (new entities get it from the
    # default chart). Mirrors how 033 seeded 2260.
    op.execute(
        """
        INSERT INTO accounts (
            id, entity_id, code, name_en, name_tr, account_type, normal_balance,
            accepts_opening_balance, is_active, created_at
        )
        SELECT
            gen_random_uuid(),
            e.id,
            '5700',
            'Tips Expense',
            'Bahşiş Gideri',
            'expense',
            'debit',
            false,
            true,
            NOW()
        FROM entities e
        WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.entity_id = e.id)
        AND NOT EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.entity_id = e.id AND a.code = '5700'
        )
        """
    )

    # POS tip carve-out column (044) — sales are now posted gross.
    op.drop_column("pos_daily_summaries", "tips_kurus")

    # Tip payout subledger (033).
    op.execute("DROP POLICY IF EXISTS tip_payouts_entity_isolation ON tip_payouts")
    op.drop_index(op.f("ix_tip_payouts_journal_entry_id"), table_name="tip_payouts")
    op.drop_index(op.f("ix_tip_payouts_money_account_id"), table_name="tip_payouts")
    op.drop_index(op.f("ix_tip_payouts_entity_id"), table_name="tip_payouts")
    op.drop_table("tip_payouts")

    # Tip accrual subledger (033).
    op.execute("DROP POLICY IF EXISTS tip_accruals_entity_isolation ON tip_accruals")
    op.drop_index(op.f("ix_tip_accruals_journal_entry_id"), table_name="tip_accruals")
    op.drop_index(op.f("ix_tip_accruals_money_account_id"), table_name="tip_accruals")
    op.drop_index(op.f("ix_tip_accruals_entity_id"), table_name="tip_accruals")
    op.drop_table("tip_accruals")
    op.execute("DROP TYPE IF EXISTS tip_accrual_source")

    # 2260 Tips Payable account — guaranteed unposted by the guard above.
    op.execute("DELETE FROM accounts WHERE code = '2260'")


def downgrade() -> None:
    # Recreate the tip subsystem (mirror of 033_tips upgrade).
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

    op.execute("DELETE FROM accounts WHERE code = '5700'")

    op.add_column(
        "pos_daily_summaries",
        sa.Column("tips_kurus", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("pos_daily_summaries", "tips_kurus", server_default=None)
