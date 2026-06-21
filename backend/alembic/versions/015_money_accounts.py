"""Money accounts (bank/cash tree) + accounts.parent_account_id."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015_money_accounts"
down_revision: Union[str, None] = "014_supplier_ledger_journal_link"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("parent_account_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_accounts_parent_account_id_accounts"),
        "accounts",
        "accounts",
        ["parent_account_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        op.f("ix_accounts_parent_account_id"),
        "accounts",
        ["parent_account_id"],
    )

    op.create_table(
        "money_accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column(
            "account_kind",
            sa.Enum("bank", "cash", name="money_account_kind", native_enum=False, length=8),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("gl_account_id", sa.Uuid(), nullable=False),
        sa.Column("bank_name", sa.String(length=255), nullable=True),
        sa.Column("iban", sa.String(length=34), nullable=True),
        sa.Column("last_four", sa.String(length=4), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_money_accounts_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["gl_account_id"],
            ["accounts.id"],
            name=op.f("fk_money_accounts_gl_account_id_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_money_accounts")),
        sa.UniqueConstraint("entity_id", "name", name="uq_money_accounts_entity_name"),
        sa.UniqueConstraint("gl_account_id", name="uq_money_accounts_gl_account_id"),
    )
    op.create_index(op.f("ix_money_accounts_entity_id"), "money_accounts", ["entity_id"])
    op.create_index(op.f("ix_money_accounts_gl_account_id"), "money_accounts", ["gl_account_id"])

    op.execute("ALTER TABLE money_accounts ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE money_accounts FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY money_accounts_entity_isolation ON money_accounts
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
    op.execute("DROP POLICY IF EXISTS money_accounts_entity_isolation ON money_accounts")
    op.drop_index(op.f("ix_money_accounts_gl_account_id"), table_name="money_accounts")
    op.drop_index(op.f("ix_money_accounts_entity_id"), table_name="money_accounts")
    op.drop_table("money_accounts")
    op.drop_index(op.f("ix_accounts_parent_account_id"), table_name="accounts")
    op.drop_constraint(
        op.f("fk_accounts_parent_account_id_accounts"),
        "accounts",
        type_="foreignkey",
    )
    op.drop_column("accounts", "parent_account_id")
