"""Delivery commission e-Fatura — draft typing, report commission link, expense seed."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "031_delivery_commission_efatura"
down_revision: Union[str, None] = "030_delivery_platform_reports"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "invoice_drafts",
        sa.Column(
            "invoice_kind",
            sa.String(length=32),
            nullable=False,
            server_default="supplier",
        ),
    )
    op.add_column(
        "invoice_drafts",
        sa.Column("delivery_report_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_invoice_drafts_delivery_report_id_delivery_reports"),
        "invoice_drafts",
        "delivery_reports",
        ["delivery_report_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        op.f("ix_invoice_drafts_delivery_report_id"),
        "invoice_drafts",
        ["delivery_report_id"],
    )
    op.alter_column("invoice_drafts", "invoice_kind", server_default=None)

    op.execute(
        """
        CREATE UNIQUE INDEX uq_invoice_drafts_delivery_report_posted
        ON invoice_drafts (delivery_report_id)
        WHERE status = 'posted' AND invoice_kind = 'delivery_commission'
        """
    )

    op.add_column(
        "delivery_reports",
        sa.Column("commission_journal_entry_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_delivery_reports_commission_journal_entry_id_journal_entries"),
        "delivery_reports",
        "journal_entries",
        ["commission_journal_entry_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        op.f("ix_delivery_reports_commission_journal_entry_id"),
        "delivery_reports",
        ["commission_journal_entry_id"],
    )
    op.create_unique_constraint(
        "uq_delivery_reports_commission_journal_entry_id",
        "delivery_reports",
        ["commission_journal_entry_id"],
    )

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
            '5500',
            'Delivery Platform Commission',
            'Yemek Platformu Komisyonu',
            'expense',
            'debit',
            false,
            true,
            now()
        FROM entities e
        WHERE EXISTS (
            SELECT 1 FROM accounts a WHERE a.entity_id = e.id
        )
        AND NOT EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.entity_id = e.id AND a.code = '5500'
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM accounts
        WHERE code = '5500'
          AND name_en = 'Delivery Platform Commission'
          AND NOT EXISTS (
              SELECT 1 FROM journal_entry_lines jel
              WHERE jel.account_id = accounts.id
          )
        """
    )

    op.drop_constraint(
        "uq_delivery_reports_commission_journal_entry_id",
        "delivery_reports",
        type_="unique",
    )
    op.drop_index(
        op.f("ix_delivery_reports_commission_journal_entry_id"),
        table_name="delivery_reports",
    )
    op.drop_constraint(
        op.f("fk_delivery_reports_commission_journal_entry_id_journal_entries"),
        "delivery_reports",
        type_="foreignkey",
    )
    op.drop_column("delivery_reports", "commission_journal_entry_id")

    op.execute("DROP INDEX IF EXISTS uq_invoice_drafts_delivery_report_posted")
    op.drop_index(
        op.f("ix_invoice_drafts_delivery_report_id"), table_name="invoice_drafts"
    )
    op.drop_constraint(
        op.f("fk_invoice_drafts_delivery_report_id_delivery_reports"),
        "invoice_drafts",
        type_="foreignkey",
    )
    op.drop_column("invoice_drafts", "delivery_report_id")
    op.drop_column("invoice_drafts", "invoice_kind")
