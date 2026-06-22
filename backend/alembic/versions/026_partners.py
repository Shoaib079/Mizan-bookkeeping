"""Partners + reimbursement ledger; per-partner opening balances (Decisions §17)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.partners_immutability import apply_partners_immutability

revision: str = "026_partners"
down_revision: Union[str, None] = "025_staff"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "partners",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=512), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("notes", sa.String(length=2048), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_partners_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_partners")),
    )
    op.create_index(op.f("ix_partners_entity_id"), "partners", ["entity_id"])

    op.create_table(
        "partner_ledger_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("partner_id", sa.Uuid(), nullable=False),
        sa.Column("movement_date", sa.Date(), nullable=False),
        sa.Column(
            "movement_type",
            sa.Enum(
                "opening_balance",
                "expense_fronted",
                "reimbursement_paid",
                name="partner_movement_type",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("amount_kurus", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("reference_type", sa.String(length=64), nullable=True),
        sa.Column("reference_id", sa.Uuid(), nullable=True),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_partner_ledger_entries_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_partner_ledger_entries_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["partner_id"],
            ["partners.id"],
            name=op.f("fk_partner_ledger_entries_partner_id_partners"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_partner_ledger_entries")),
    )
    op.create_index(
        op.f("ix_partner_ledger_entries_entity_id"),
        "partner_ledger_entries",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_partner_ledger_entries_partner_id"),
        "partner_ledger_entries",
        ["partner_id"],
    )
    op.create_index(
        op.f("ix_partner_ledger_entries_journal_entry_id"),
        "partner_ledger_entries",
        ["journal_entry_id"],
    )

    op.execute("ALTER TABLE partners ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE partners FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY partners_entity_isolation ON partners
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )

    op.execute("ALTER TABLE partner_ledger_entries ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE partner_ledger_entries FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY partner_ledger_entries_entity_isolation ON partner_ledger_entries
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
    apply_partners_immutability(bind)

    op.execute(
        """
        UPDATE accounts
        SET accepts_opening_balance = true
        WHERE code = '2150'
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS partner_ledger_entries_immutable ON partner_ledger_entries"
    )
    op.execute("DROP FUNCTION IF EXISTS prevent_partner_ledger_entry_mutation()")
    op.execute(
        "DROP POLICY IF EXISTS partner_ledger_entries_entity_isolation ON partner_ledger_entries"
    )
    op.execute("DROP POLICY IF EXISTS partners_entity_isolation ON partners")
    op.drop_index(
        op.f("ix_partner_ledger_entries_journal_entry_id"),
        table_name="partner_ledger_entries",
    )
    op.drop_index(
        op.f("ix_partner_ledger_entries_partner_id"),
        table_name="partner_ledger_entries",
    )
    op.drop_index(
        op.f("ix_partner_ledger_entries_entity_id"),
        table_name="partner_ledger_entries",
    )
    op.drop_table("partner_ledger_entries")
    op.execute("DROP TYPE IF EXISTS partner_movement_type")
    op.drop_index(op.f("ix_partners_entity_id"), table_name="partners")
    op.drop_table("partners")
    op.execute(
        """
        UPDATE accounts
        SET accepts_opening_balance = false
        WHERE code = '2150'
        """
    )
