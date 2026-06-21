"""Cash drawer sessions and movements (Decisions §14)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "023_cash_drawer"
down_revision: Union[str, None] = "022_credit_card_payment_bank_fee_gl"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cash_drawer_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("money_account_id", sa.Uuid(), nullable=False),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("expected_balance_kurus", sa.Integer(), nullable=True),
        sa.Column("counted_balance_kurus", sa.Integer(), nullable=True),
        sa.Column("over_short_kurus", sa.Integer(), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_by", sa.Uuid(), nullable=True),
        sa.Column("close_journal_entry_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_cash_drawer_sessions_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["money_account_id"],
            ["money_accounts.id"],
            name=op.f("fk_cash_drawer_sessions_money_account_id_money_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["close_journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_cash_drawer_sessions_close_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cash_drawer_sessions")),
        sa.UniqueConstraint(
            "entity_id",
            "money_account_id",
            "session_date",
            name="uq_cash_drawer_sessions_entity_account_date",
        ),
        sa.UniqueConstraint(
            "close_journal_entry_id",
            name="uq_cash_drawer_sessions_close_journal_entry_id",
        ),
    )
    op.create_index(
        op.f("ix_cash_drawer_sessions_entity_id"),
        "cash_drawer_sessions",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_cash_drawer_sessions_money_account_id"),
        "cash_drawer_sessions",
        ["money_account_id"],
    )
    op.create_index(
        op.f("ix_cash_drawer_sessions_close_journal_entry_id"),
        "cash_drawer_sessions",
        ["close_journal_entry_id"],
    )

    op.create_table(
        "cash_movements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("money_account_id", sa.Uuid(), nullable=False),
        sa.Column("movement_date", sa.Date(), nullable=False),
        sa.Column("direction", sa.String(length=8), nullable=False),
        sa.Column("amount_kurus", sa.Integer(), nullable=False),
        sa.Column("offset_account_id", sa.Uuid(), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_cash_movements_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["cash_drawer_sessions.id"],
            name=op.f("fk_cash_movements_session_id_cash_drawer_sessions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["money_account_id"],
            ["money_accounts.id"],
            name=op.f("fk_cash_movements_money_account_id_money_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["offset_account_id"],
            ["accounts.id"],
            name=op.f("fk_cash_movements_offset_account_id_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_cash_movements_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cash_movements")),
        sa.UniqueConstraint("journal_entry_id", name="uq_cash_movements_journal_entry_id"),
    )
    op.create_index(op.f("ix_cash_movements_entity_id"), "cash_movements", ["entity_id"])
    op.create_index(op.f("ix_cash_movements_session_id"), "cash_movements", ["session_id"])
    op.create_index(
        op.f("ix_cash_movements_money_account_id"), "cash_movements", ["money_account_id"]
    )
    op.create_index(
        op.f("ix_cash_movements_offset_account_id"), "cash_movements", ["offset_account_id"]
    )
    op.create_index(
        op.f("ix_cash_movements_journal_entry_id"), "cash_movements", ["journal_entry_id"]
    )

    op.execute("ALTER TABLE cash_drawer_sessions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE cash_drawer_sessions FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY cash_drawer_sessions_entity_isolation ON cash_drawer_sessions
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )

    op.execute("ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE cash_movements FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY cash_movements_entity_isolation ON cash_movements
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
    op.execute("DROP POLICY IF EXISTS cash_movements_entity_isolation ON cash_movements")
    op.execute(
        "DROP POLICY IF EXISTS cash_drawer_sessions_entity_isolation ON cash_drawer_sessions"
    )
    op.drop_index(op.f("ix_cash_movements_journal_entry_id"), table_name="cash_movements")
    op.drop_index(op.f("ix_cash_movements_offset_account_id"), table_name="cash_movements")
    op.drop_index(op.f("ix_cash_movements_money_account_id"), table_name="cash_movements")
    op.drop_index(op.f("ix_cash_movements_session_id"), table_name="cash_movements")
    op.drop_index(op.f("ix_cash_movements_entity_id"), table_name="cash_movements")
    op.drop_table("cash_movements")
    op.drop_index(
        op.f("ix_cash_drawer_sessions_close_journal_entry_id"),
        table_name="cash_drawer_sessions",
    )
    op.drop_index(
        op.f("ix_cash_drawer_sessions_money_account_id"), table_name="cash_drawer_sessions"
    )
    op.drop_index(op.f("ix_cash_drawer_sessions_entity_id"), table_name="cash_drawer_sessions")
    op.drop_table("cash_drawer_sessions")
