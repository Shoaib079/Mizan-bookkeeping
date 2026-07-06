"""Agency group sales v2 — menus, itemized sales, 4300 revenue, edit/void."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.rls import apply_entity_rls

revision: str = "076_agency_group_sales_v2"
down_revision: Union[str, None] = "075_customer_group_sales"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO accounts (
            id, entity_id, code, name_en, name_tr,
            account_type, normal_balance, accepts_opening_balance,
            is_active, created_at
        )
        SELECT
            gen_random_uuid(),
            e.id,
            '4300',
            'Group / Agency Sales',
            'Grup / Acente Satışları',
            'REVENUE',
            'CREDIT',
            false,
            true,
            now()
        FROM entities e
        WHERE EXISTS (
            SELECT 1 FROM accounts a WHERE a.entity_id = e.id
        )
        AND NOT EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.entity_id = e.id AND a.code = '4300'
        )
        """
    )

    op.create_table(
        "group_menus",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_group_menus_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_group_menus")),
    )
    op.create_index(op.f("ix_group_menus_entity_id"), "group_menus", ["entity_id"])

    op.create_table(
        "group_sales",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("sale_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="posted",
        ),
        sa.Column("total_kurus", sa.Integer(), nullable=False),
        sa.Column("forex_currency", sa.String(length=3), nullable=True),
        sa.Column("total_forex_minor", sa.Integer(), nullable=True),
        sa.Column("fx_rate_used", sa.Integer(), nullable=True),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=True),
        sa.Column("customer_ledger_entry_id", sa.Uuid(), nullable=True),
        sa.Column("amends_group_sale_id", sa.Uuid(), nullable=True),
        sa.Column("amended_by_group_sale_id", sa.Uuid(), nullable=True),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            name=op.f("fk_group_sales_customer_id_customers"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_group_sales_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_group_sales_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["customer_ledger_entry_id"],
            ["customer_ledger_entries.id"],
            name=op.f("fk_group_sales_customer_ledger_entry_id_customer_ledger_entries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["amends_group_sale_id"],
            ["group_sales.id"],
            name=op.f("fk_group_sales_amends_group_sale_id_group_sales"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["amended_by_group_sale_id"],
            ["group_sales.id"],
            name=op.f("fk_group_sales_amended_by_group_sale_id_group_sales"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_group_sales")),
    )
    op.create_index(op.f("ix_group_sales_entity_id"), "group_sales", ["entity_id"])
    op.create_index(op.f("ix_group_sales_customer_id"), "group_sales", ["customer_id"])
    op.create_index(
        op.f("ix_group_sales_journal_entry_id"), "group_sales", ["journal_entry_id"]
    )

    op.create_table(
        "group_sale_lines",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("group_sale_id", sa.Uuid(), nullable=False),
        sa.Column("group_menu_id", sa.Uuid(), nullable=True),
        sa.Column("menu_name_snapshot", sa.String(length=255), nullable=False),
        sa.Column("pax", sa.Integer(), nullable=False),
        sa.Column("rate_per_person_minor", sa.Integer(), nullable=False),
        sa.Column("line_total_minor", sa.Integer(), nullable=False),
        sa.Column("line_total_kurus", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_group_sale_lines_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["group_sale_id"],
            ["group_sales.id"],
            name=op.f("fk_group_sale_lines_group_sale_id_group_sales"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["group_menu_id"],
            ["group_menus.id"],
            name=op.f("fk_group_sale_lines_group_menu_id_group_menus"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_group_sale_lines")),
    )
    op.create_index(
        op.f("ix_group_sale_lines_entity_id"), "group_sale_lines", ["entity_id"]
    )
    op.create_index(
        op.f("ix_group_sale_lines_group_sale_id"),
        "group_sale_lines",
        ["group_sale_id"],
    )

    apply_entity_rls(op.get_bind())


def downgrade() -> None:
    op.drop_table("group_sale_lines")
    op.drop_table("group_sales")
    op.drop_table("group_menus")
    op.execute(
        """
        DELETE FROM accounts
        WHERE code = '4300'
          AND name_en = 'Group / Agency Sales'
          AND NOT EXISTS (
              SELECT 1 FROM journal_entry_lines jel
              WHERE jel.account_id = accounts.id
          )
        """
    )
    apply_entity_rls(op.get_bind())
