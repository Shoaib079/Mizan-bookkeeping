"""Delivery platform reports, settlements, clearing accounts (Decisions §9)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "030_delivery_platform_reports"
down_revision: Union[str, None] = "029_pos_daily_summaries_posted_date_unique"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "delivery_reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("report_date", sa.Date(), nullable=False),
        sa.Column("gross_kurus", sa.Integer(), nullable=False),
        sa.Column("commission_kurus", sa.Integer(), nullable=False),
        sa.Column("net_kurus", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("file_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("review_reason", sa.String(length=512), nullable=True),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=True),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("posted_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_delivery_reports_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_delivery_reports_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_reports")),
        sa.UniqueConstraint(
            "entity_id",
            "file_fingerprint",
            name="uq_delivery_reports_entity_fingerprint",
        ),
        sa.UniqueConstraint(
            "journal_entry_id",
            name="uq_delivery_reports_journal_entry_id",
        ),
    )
    op.create_index(
        op.f("ix_delivery_reports_entity_id"), "delivery_reports", ["entity_id"]
    )
    op.create_index(
        op.f("ix_delivery_reports_platform"), "delivery_reports", ["platform"]
    )
    op.create_index(
        op.f("ix_delivery_reports_file_fingerprint"),
        "delivery_reports",
        ["file_fingerprint"],
    )
    op.create_index(
        op.f("ix_delivery_reports_journal_entry_id"),
        "delivery_reports",
        ["journal_entry_id"],
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_delivery_reports_entity_platform_date_posted
        ON delivery_reports (entity_id, platform, report_date)
        WHERE status = 'posted'
        """
    )

    op.create_table(
        "delivery_settlements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("money_account_id", sa.Uuid(), nullable=False),
        sa.Column("settlement_date", sa.Date(), nullable=False),
        sa.Column("amount_kurus", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=False),
        sa.Column("reference_type", sa.String(length=64), nullable=True),
        sa.Column("reference_id", sa.Uuid(), nullable=True),
        sa.Column("bank_statement_line_id", sa.Uuid(), nullable=True),
        sa.Column("delivery_report_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_delivery_settlements_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["money_account_id"],
            ["money_accounts.id"],
            name=op.f("fk_delivery_settlements_money_account_id_money_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_delivery_settlements_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["bank_statement_line_id"],
            ["bank_statement_lines.id"],
            name=op.f(
                "fk_delivery_settlements_bank_statement_line_id_bank_statement_lines"
            ),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["delivery_report_id"],
            ["delivery_reports.id"],
            name=op.f("fk_delivery_settlements_delivery_report_id_delivery_reports"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_settlements")),
        sa.UniqueConstraint(
            "journal_entry_id", name="uq_delivery_settlements_journal_entry_id"
        ),
    )
    op.create_index(
        op.f("ix_delivery_settlements_entity_id"), "delivery_settlements", ["entity_id"]
    )
    op.create_index(
        op.f("ix_delivery_settlements_platform"), "delivery_settlements", ["platform"]
    )
    op.create_index(
        op.f("ix_delivery_settlements_money_account_id"),
        "delivery_settlements",
        ["money_account_id"],
    )
    op.create_index(
        op.f("ix_delivery_settlements_journal_entry_id"),
        "delivery_settlements",
        ["journal_entry_id"],
    )
    op.create_index(
        op.f("ix_delivery_settlements_bank_statement_line_id"),
        "delivery_settlements",
        ["bank_statement_line_id"],
    )
    op.create_index(
        op.f("ix_delivery_settlements_delivery_report_id"),
        "delivery_settlements",
        ["delivery_report_id"],
    )

    op.add_column(
        "bank_statement_lines",
        sa.Column("delivery_settlement_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        op.f("ix_bank_statement_lines_delivery_settlement_id"),
        "bank_statement_lines",
        ["delivery_settlement_id"],
    )
    op.create_foreign_key(
        op.f("fk_bank_statement_lines_delivery_settlement_id_delivery_settlements"),
        "bank_statement_lines",
        "delivery_settlements",
        ["delivery_settlement_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.execute("ALTER TABLE delivery_reports ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE delivery_reports FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY delivery_reports_entity_isolation ON delivery_reports
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )

    op.execute("ALTER TABLE delivery_settlements ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE delivery_settlements FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY delivery_settlements_entity_isolation ON delivery_settlements
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )

    for code, name_en, name_tr in (
        ("1410", "Getir Clearing", "Getir Takas"),
        ("1420", "Yemeksepeti Clearing", "Yemeksepeti Takas"),
        ("1430", "Trendyol Clearing", "Trendyol Takas"),
    ):
        op.execute(
            f"""
            INSERT INTO accounts (
                id, entity_id, code, name_en, name_tr,
                account_type, normal_balance, accepts_opening_balance,
                is_active, created_at
            )
            SELECT
                gen_random_uuid(),
                e.id,
                '{code}',
                '{name_en}',
                '{name_tr}',
                'asset',
                'debit',
                true,
                true,
                now()
            FROM entities e
            WHERE EXISTS (
                SELECT 1 FROM accounts a WHERE a.entity_id = e.id
            )
            AND NOT EXISTS (
                SELECT 1 FROM accounts a
                WHERE a.entity_id = e.id AND a.code = '{code}'
            )
            """
        )


def downgrade() -> None:
    for code in ("1410", "1420", "1430"):
        op.execute(
            f"""
            DELETE FROM accounts
            WHERE code = '{code}'
              AND NOT EXISTS (
                  SELECT 1 FROM journal_entry_lines jel
                  WHERE jel.account_id = accounts.id
              )
            """
        )

    op.execute(
        "DROP POLICY IF EXISTS delivery_settlements_entity_isolation ON delivery_settlements"
    )
    op.execute(
        "DROP POLICY IF EXISTS delivery_reports_entity_isolation ON delivery_reports"
    )

    op.drop_constraint(
        op.f("fk_bank_statement_lines_delivery_settlement_id_delivery_settlements"),
        "bank_statement_lines",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_bank_statement_lines_delivery_settlement_id"),
        table_name="bank_statement_lines",
    )
    op.drop_column("bank_statement_lines", "delivery_settlement_id")

    op.drop_index(
        op.f("ix_delivery_settlements_delivery_report_id"),
        table_name="delivery_settlements",
    )
    op.drop_index(
        op.f("ix_delivery_settlements_bank_statement_line_id"),
        table_name="delivery_settlements",
    )
    op.drop_index(
        op.f("ix_delivery_settlements_journal_entry_id"),
        table_name="delivery_settlements",
    )
    op.drop_index(
        op.f("ix_delivery_settlements_money_account_id"),
        table_name="delivery_settlements",
    )
    op.drop_index(
        op.f("ix_delivery_settlements_platform"), table_name="delivery_settlements"
    )
    op.drop_index(
        op.f("ix_delivery_settlements_entity_id"), table_name="delivery_settlements"
    )
    op.drop_table("delivery_settlements")

    op.execute(
        "DROP INDEX IF EXISTS uq_delivery_reports_entity_platform_date_posted"
    )
    op.drop_index(
        op.f("ix_delivery_reports_journal_entry_id"), table_name="delivery_reports"
    )
    op.drop_index(
        op.f("ix_delivery_reports_file_fingerprint"), table_name="delivery_reports"
    )
    op.drop_index(op.f("ix_delivery_reports_platform"), table_name="delivery_reports")
    op.drop_index(op.f("ix_delivery_reports_entity_id"), table_name="delivery_reports")
    op.drop_table("delivery_reports")
