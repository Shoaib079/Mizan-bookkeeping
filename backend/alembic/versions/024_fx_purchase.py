"""FX foreign currency wallets + purchase subledger (Decisions §15)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.fx_immutability import apply_fx_immutability

revision: str = "024_fx_purchase"
down_revision: Union[str, None] = "023_cash_drawer"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("money_accounts", sa.Column("currency", sa.String(length=3), nullable=True))

    op.alter_column(
        "money_accounts",
        "account_kind",
        existing_type=sa.Enum(
            "bank",
            "cash",
            "credit_card",
            name="money_account_kind",
            native_enum=False,
            length=12,
        ),
        type_=sa.Enum(
            "bank",
            "cash",
            "credit_card",
            "foreign_currency",
            name="money_account_kind",
            native_enum=False,
            length=16,
        ),
        existing_nullable=False,
    )

    op.create_table(
        "fx_ledger_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("fx_money_account_id", sa.Uuid(), nullable=False),
        sa.Column("movement_date", sa.Date(), nullable=False),
        sa.Column(
            "movement_type",
            sa.Enum(
                "purchase",
                name="fx_movement_type",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("native_quantity", sa.Integer(), nullable=False),
        sa.Column("try_cost_kurus", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_fx_ledger_entries_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["fx_money_account_id"],
            ["money_accounts.id"],
            name=op.f("fk_fx_ledger_entries_fx_money_account_id_money_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_fx_ledger_entries_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fx_ledger_entries")),
        sa.UniqueConstraint("journal_entry_id", name="uq_fx_ledger_entries_journal_entry_id"),
    )
    op.create_index(
        op.f("ix_fx_ledger_entries_entity_id"),
        "fx_ledger_entries",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_fx_ledger_entries_fx_money_account_id"),
        "fx_ledger_entries",
        ["fx_money_account_id"],
    )
    op.create_index(
        op.f("ix_fx_ledger_entries_journal_entry_id"),
        "fx_ledger_entries",
        ["journal_entry_id"],
    )

    op.execute("ALTER TABLE fx_ledger_entries ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE fx_ledger_entries FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY fx_ledger_entries_entity_isolation ON fx_ledger_entries
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
    apply_fx_immutability(bind)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS fx_ledger_entries_immutable ON fx_ledger_entries")
    op.execute("DROP FUNCTION IF EXISTS prevent_fx_ledger_entry_mutation()")
    op.execute("DROP POLICY IF EXISTS fx_ledger_entries_entity_isolation ON fx_ledger_entries")
    op.drop_index(op.f("ix_fx_ledger_entries_journal_entry_id"), table_name="fx_ledger_entries")
    op.drop_index(op.f("ix_fx_ledger_entries_fx_money_account_id"), table_name="fx_ledger_entries")
    op.drop_index(op.f("ix_fx_ledger_entries_entity_id"), table_name="fx_ledger_entries")
    op.drop_table("fx_ledger_entries")
    op.execute("DROP TYPE IF EXISTS fx_movement_type")

    op.alter_column(
        "money_accounts",
        "account_kind",
        existing_type=sa.Enum(
            "bank",
            "cash",
            "credit_card",
            "foreign_currency",
            name="money_account_kind",
            native_enum=False,
            length=16,
        ),
        type_=sa.Enum(
            "bank",
            "cash",
            "credit_card",
            name="money_account_kind",
            native_enum=False,
            length=12,
        ),
        existing_nullable=False,
    )
    op.drop_column("money_accounts", "currency")
