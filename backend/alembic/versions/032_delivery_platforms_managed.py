"""User-managed delivery platforms with per-platform clearing sub-accounts (Decisions §9)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "032_delivery_platforms_managed"
down_revision: Union[str, None] = "031_delivery_commission_efatura"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LEGACY_PLATFORM_ROWS = (
    ("1410", "Getir"),
    ("1420", "Yemeksepeti"),
    ("1430", "Trendyol"),
)

LEGACY_SLUG_TO_NAME = {
    "getir": "Getir",
    "yemeksepeti": "Yemeksepeti",
    "trendyol": "Trendyol",
}


def upgrade() -> None:
    # Parent bucket 1450 for new-style delivery clearing sub-accounts.
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
            '1450',
            'Delivery Platform Clearing',
            'Yemek Platformu Takas',
            'asset',
            'debit',
            true,
            true,
            now()
        FROM entities e
        WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.entity_id = e.id)
        AND NOT EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.entity_id = e.id AND a.code = '1450'
        )
        """
    )

    # Reparent legacy fixed clearing accounts under 1450 where both exist.
    op.execute(
        """
        UPDATE accounts child
        SET parent_account_id = parent.id
        FROM accounts parent
        WHERE parent.entity_id = child.entity_id
          AND parent.code = '1450'
          AND child.code IN ('1410', '1420', '1430')
          AND child.parent_account_id IS NULL
        """
    )

    op.create_table(
        "delivery_platforms",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("gl_account_id", sa.Uuid(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_delivery_platforms_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["gl_account_id"],
            ["accounts.id"],
            name=op.f("fk_delivery_platforms_gl_account_id_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_platforms")),
        sa.UniqueConstraint(
            "entity_id",
            "name",
            name="uq_delivery_platforms_entity_name",
        ),
        sa.UniqueConstraint(
            "gl_account_id",
            name="uq_delivery_platforms_gl_account_id",
        ),
    )
    op.create_index(
        op.f("ix_delivery_platforms_entity_id"),
        "delivery_platforms",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_delivery_platforms_gl_account_id"),
        "delivery_platforms",
        ["gl_account_id"],
    )

    for code, name in LEGACY_PLATFORM_ROWS:
        op.execute(
            f"""
            INSERT INTO delivery_platforms (
                id, entity_id, name, gl_account_id, is_active, created_at, updated_at
            )
            SELECT
                gen_random_uuid(),
                a.entity_id,
                '{name}',
                a.id,
                true,
                now(),
                now()
            FROM accounts a
            WHERE a.code = '{code}'
            AND NOT EXISTS (
                SELECT 1 FROM delivery_platforms dp
                WHERE dp.entity_id = a.entity_id AND dp.name = '{name}'
            )
            """
        )

    op.execute("ALTER TABLE delivery_platforms ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE delivery_platforms FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY delivery_platforms_entity_isolation ON delivery_platforms
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )

    op.add_column(
        "delivery_reports",
        sa.Column("delivery_platform_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "delivery_settlements",
        sa.Column("delivery_platform_id", sa.Uuid(), nullable=True),
    )

    for slug, name in LEGACY_SLUG_TO_NAME.items():
        op.execute(
            f"""
            UPDATE delivery_reports dr
            SET delivery_platform_id = dp.id
            FROM delivery_platforms dp
            WHERE dr.entity_id = dp.entity_id
              AND dr.platform = '{slug}'
              AND dp.name = '{name}'
            """
        )
        op.execute(
            f"""
            UPDATE delivery_settlements ds
            SET delivery_platform_id = dp.id
            FROM delivery_platforms dp
            WHERE ds.entity_id = dp.entity_id
              AND ds.platform = '{slug}'
              AND dp.name = '{name}'
            """
        )

    op.execute(
        """
        DELETE FROM delivery_reports
        WHERE delivery_platform_id IS NULL
        """
    )
    op.execute(
        """
        DELETE FROM delivery_settlements
        WHERE delivery_platform_id IS NULL
        """
    )

    op.alter_column("delivery_reports", "delivery_platform_id", nullable=False)
    op.alter_column("delivery_settlements", "delivery_platform_id", nullable=False)

    op.create_foreign_key(
        op.f("fk_delivery_reports_delivery_platform_id_delivery_platforms"),
        "delivery_reports",
        "delivery_platforms",
        ["delivery_platform_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_delivery_settlements_delivery_platform_id_delivery_platforms"),
        "delivery_settlements",
        "delivery_platforms",
        ["delivery_platform_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        op.f("ix_delivery_reports_delivery_platform_id"),
        "delivery_reports",
        ["delivery_platform_id"],
    )
    op.create_index(
        op.f("ix_delivery_settlements_delivery_platform_id"),
        "delivery_settlements",
        ["delivery_platform_id"],
    )

    op.execute(
        "DROP INDEX IF EXISTS uq_delivery_reports_entity_platform_date_posted"
    )
    op.drop_index(op.f("ix_delivery_reports_platform"), table_name="delivery_reports")
    op.drop_index(op.f("ix_delivery_settlements_platform"), table_name="delivery_settlements")
    op.drop_column("delivery_reports", "platform")
    op.drop_column("delivery_settlements", "platform")

    op.execute(
        """
        CREATE UNIQUE INDEX uq_delivery_reports_entity_platform_date_posted
        ON delivery_reports (entity_id, delivery_platform_id, report_date)
        WHERE status = 'posted'
        """
    )


def downgrade() -> None:
    op.add_column(
        "delivery_settlements",
        sa.Column("platform", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "delivery_reports",
        sa.Column("platform", sa.String(length=32), nullable=True),
    )

    op.execute(
        """
        UPDATE delivery_reports dr
        SET platform = lower(dp.name)
        FROM delivery_platforms dp
        WHERE dr.delivery_platform_id = dp.id
        """
    )
    op.execute(
        """
        UPDATE delivery_settlements ds
        SET platform = lower(dp.name)
        FROM delivery_platforms dp
        WHERE ds.delivery_platform_id = dp.id
        """
    )

    op.execute("DROP INDEX IF EXISTS uq_delivery_reports_entity_platform_date_posted")
    op.drop_constraint(
        op.f("fk_delivery_settlements_delivery_platform_id_delivery_platforms"),
        "delivery_settlements",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_delivery_reports_delivery_platform_id_delivery_platforms"),
        "delivery_reports",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_delivery_settlements_delivery_platform_id"),
        table_name="delivery_settlements",
    )
    op.drop_index(
        op.f("ix_delivery_reports_delivery_platform_id"),
        table_name="delivery_reports",
    )
    op.drop_column("delivery_settlements", "delivery_platform_id")
    op.drop_column("delivery_reports", "delivery_platform_id")

    op.create_index(
        op.f("ix_delivery_settlements_platform"),
        "delivery_settlements",
        ["platform"],
    )
    op.create_index(
        op.f("ix_delivery_reports_platform"),
        "delivery_reports",
        ["platform"],
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_delivery_reports_entity_platform_date_posted
        ON delivery_reports (entity_id, platform, report_date)
        WHERE status = 'posted'
        """
    )

    op.execute(
        "DROP POLICY IF EXISTS delivery_platforms_entity_isolation ON delivery_platforms"
    )
    op.drop_index(
        op.f("ix_delivery_platforms_gl_account_id"), table_name="delivery_platforms"
    )
    op.drop_index(op.f("ix_delivery_platforms_entity_id"), table_name="delivery_platforms")
    op.drop_table("delivery_platforms")

    op.execute(
        """
        UPDATE accounts child
        SET parent_account_id = NULL
        WHERE child.code IN ('1410', '1420', '1430')
        """
    )
    op.execute("DELETE FROM accounts WHERE code = '1450'")
