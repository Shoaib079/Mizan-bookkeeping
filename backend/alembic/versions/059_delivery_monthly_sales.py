"""Delivery monthly gross sales + commission linked to platform (not report)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "059_delivery_monthly_sales"
down_revision: Union[str, None] = "058_entity_vkn"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "delivery_reports",
        sa.Column("period_year", sa.Integer(), nullable=True),
    )
    op.add_column(
        "delivery_reports",
        sa.Column("period_month", sa.Integer(), nullable=True),
    )
    op.execute(
        """
        UPDATE delivery_reports
        SET period_year = EXTRACT(YEAR FROM report_date)::int,
            period_month = EXTRACT(MONTH FROM report_date)::int
        """
    )
    op.alter_column("delivery_reports", "period_year", nullable=False)
    op.alter_column("delivery_reports", "period_month", nullable=False)

    op.execute("DROP INDEX IF EXISTS uq_delivery_reports_entity_platform_date_posted")
    op.create_index(
        "uq_delivery_reports_entity_platform_period_posted",
        "delivery_reports",
        ["entity_id", "delivery_platform_id", "period_year", "period_month"],
        unique=True,
        postgresql_where=sa.text("status = 'posted'"),
    )

    op.drop_index(
        op.f("ix_delivery_reports_commission_journal_entry_id"),
        table_name="delivery_reports",
    )
    op.drop_constraint(
        "uq_delivery_reports_commission_journal_entry_id",
        "delivery_reports",
        type_="unique",
    )
    op.drop_constraint(
        op.f("fk_delivery_reports_commission_journal_entry_id_journal_entries"),
        "delivery_reports",
        type_="foreignkey",
    )
    op.drop_column("delivery_reports", "commission_journal_entry_id")
    op.drop_column("delivery_reports", "commission_kurus")
    op.drop_column("delivery_reports", "net_kurus")

    op.add_column(
        "invoice_drafts",
        sa.Column("delivery_platform_id", sa.Uuid(), nullable=True),
    )
    op.execute(
        """
        UPDATE invoice_drafts d
        SET delivery_platform_id = r.delivery_platform_id
        FROM delivery_reports r
        WHERE d.delivery_report_id = r.id
        """
    )
    op.create_foreign_key(
        op.f("fk_invoice_drafts_delivery_platform_id_delivery_platforms"),
        "invoice_drafts",
        "delivery_platforms",
        ["delivery_platform_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        op.f("ix_invoice_drafts_delivery_platform_id"),
        "invoice_drafts",
        ["delivery_platform_id"],
        unique=False,
    )

    op.execute("DROP INDEX IF EXISTS uq_invoice_drafts_delivery_report_posted")
    op.drop_index(
        op.f("ix_invoice_drafts_delivery_report_id"),
        table_name="invoice_drafts",
    )
    op.drop_constraint(
        op.f("fk_invoice_drafts_delivery_report_id_delivery_reports"),
        "invoice_drafts",
        type_="foreignkey",
    )
    op.drop_column("invoice_drafts", "delivery_report_id")


def downgrade() -> None:
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
        unique=False,
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_invoice_drafts_delivery_report_posted
        ON invoice_drafts (delivery_report_id)
        WHERE status = 'posted' AND invoice_kind = 'delivery_commission'
        """
    )
    op.drop_index(
        op.f("ix_invoice_drafts_delivery_platform_id"),
        table_name="invoice_drafts",
    )
    op.drop_constraint(
        op.f("fk_invoice_drafts_delivery_platform_id_delivery_platforms"),
        "invoice_drafts",
        type_="foreignkey",
    )
    op.drop_column("invoice_drafts", "delivery_platform_id")

    op.add_column(
        "delivery_reports",
        sa.Column("net_kurus", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "delivery_reports",
        sa.Column("commission_kurus", sa.Integer(), nullable=False, server_default="0"),
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
        unique=False,
    )
    op.create_unique_constraint(
        "uq_delivery_reports_commission_journal_entry_id",
        "delivery_reports",
        ["commission_journal_entry_id"],
    )
    op.alter_column("delivery_reports", "net_kurus", server_default=None)
    op.alter_column("delivery_reports", "commission_kurus", server_default=None)

    op.drop_index(
        "uq_delivery_reports_entity_platform_period_posted",
        table_name="delivery_reports",
    )
    op.create_index(
        "uq_delivery_reports_entity_platform_date_posted",
        "delivery_reports",
        ["entity_id", "delivery_platform_id", "report_date"],
        unique=True,
        postgresql_where=sa.text("status = 'posted'"),
    )
    op.drop_column("delivery_reports", "period_month")
    op.drop_column("delivery_reports", "period_year")
