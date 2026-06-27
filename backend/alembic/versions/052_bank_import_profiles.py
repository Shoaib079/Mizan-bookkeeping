"""Bank import column profiles — entity-scoped, one per bank money account."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "052_bank_import_profiles"
down_revision: Union[str, None] = "051_drop_tips_expense_5700"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bank_import_profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("money_account_id", sa.Uuid(), nullable=False),
        sa.Column("header_row", sa.Integer(), nullable=False),
        sa.Column("data_start_row", sa.Integer(), nullable=False),
        sa.Column("date_col", sa.Integer(), nullable=False),
        sa.Column("description_col", sa.Integer(), nullable=False),
        sa.Column("reference_col", sa.Integer(), nullable=True),
        sa.Column("amount_col", sa.Integer(), nullable=True),
        sa.Column("debit_col", sa.Integer(), nullable=True),
        sa.Column("credit_col", sa.Integer(), nullable=True),
        sa.Column("date_format", sa.String(length=16), nullable=False),
        sa.Column("decimal_format", sa.String(length=8), nullable=False, server_default="tr"),
        sa.Column("debit_is_outflow", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_bank_import_profiles_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["money_account_id"],
            ["money_accounts.id"],
            name=op.f("fk_bank_import_profiles_money_account_id_money_accounts"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bank_import_profiles")),
        sa.UniqueConstraint(
            "entity_id",
            "money_account_id",
            name="uq_bank_import_profiles_entity_account",
        ),
    )
    op.create_index(
        op.f("ix_bank_import_profiles_entity_id"),
        "bank_import_profiles",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_bank_import_profiles_money_account_id"),
        "bank_import_profiles",
        ["money_account_id"],
    )

    op.execute("ALTER TABLE bank_import_profiles ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE bank_import_profiles FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY bank_import_profiles_entity_isolation ON bank_import_profiles
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
        "DROP POLICY IF EXISTS bank_import_profiles_entity_isolation ON bank_import_profiles"
    )
    op.drop_index(
        op.f("ix_bank_import_profiles_money_account_id"),
        table_name="bank_import_profiles",
    )
    op.drop_index(
        op.f("ix_bank_import_profiles_entity_id"),
        table_name="bank_import_profiles",
    )
    op.drop_table("bank_import_profiles")
