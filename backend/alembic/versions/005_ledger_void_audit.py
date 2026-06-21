"""Journal void/reverse links, audit trail, immutability triggers."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_ledger_void_audit"
down_revision: Union[str, None] = "004_accounts_posting_lookup"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "journal_entries",
        sa.Column("status", sa.String(length=16), nullable=False, server_default="posted"),
    )
    op.add_column(
        "journal_entries",
        sa.Column("reverses_entry_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "journal_entries",
        sa.Column("reversed_by_entry_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "journal_entries",
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        op.f("ix_journal_entries_reverses_entry_id"),
        "journal_entries",
        ["reverses_entry_id"],
    )
    op.create_index(
        op.f("ix_journal_entries_reversed_by_entry_id"),
        "journal_entries",
        ["reversed_by_entry_id"],
    )
    op.create_foreign_key(
        op.f("fk_journal_entries_reverses_entry_id_journal_entries"),
        "journal_entries",
        "journal_entries",
        ["reverses_entry_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_journal_entries_reversed_by_entry_id_journal_entries"),
        "journal_entries",
        "journal_entries",
        ["reversed_by_entry_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.alter_column("journal_entries", "status", server_default=None)

    op.drop_constraint(
        op.f("fk_journal_entry_lines_journal_entry_id_journal_entries"),
        "journal_entry_lines",
        type_="foreignkey",
    )
    op.create_foreign_key(
        op.f("fk_journal_entry_lines_journal_entry_id_journal_entries"),
        "journal_entry_lines",
        "journal_entries",
        ["journal_entry_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.create_table(
        "ledger_audit_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=8), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_ledger_audit_events_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_ledger_audit_events_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ledger_audit_events")),
    )
    op.create_index(
        op.f("ix_ledger_audit_events_entity_id"), "ledger_audit_events", ["entity_id"]
    )
    op.create_index(
        op.f("ix_ledger_audit_events_journal_entry_id"),
        "ledger_audit_events",
        ["journal_entry_id"],
    )

    op.execute("ALTER TABLE ledger_audit_events ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE ledger_audit_events FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY ledger_audit_events_entity_isolation ON ledger_audit_events
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_journal_line_mutation()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'journal entry lines are immutable';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER journal_entry_lines_immutable
        BEFORE UPDATE OR DELETE ON journal_entry_lines
        FOR EACH ROW EXECUTE FUNCTION prevent_journal_line_mutation();
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_journal_entry_delete()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'journal entries cannot be deleted';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER journal_entries_no_delete
        BEFORE DELETE ON journal_entries
        FOR EACH ROW EXECUTE FUNCTION prevent_journal_entry_delete();
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION restrict_journal_entry_update()
        RETURNS TRIGGER AS $$
        BEGIN
            IF OLD.entry_date IS DISTINCT FROM NEW.entry_date
               OR OLD.description IS DISTINCT FROM NEW.description
               OR OLD.entity_id IS DISTINCT FROM NEW.entity_id
               OR OLD.created_at IS DISTINCT FROM NEW.created_at
               OR OLD.reverses_entry_id IS DISTINCT FROM NEW.reverses_entry_id
            THEN
                RAISE EXCEPTION 'journal entries are immutable except void metadata';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER journal_entries_restrict_update
        BEFORE UPDATE ON journal_entries
        FOR EACH ROW EXECUTE FUNCTION restrict_journal_entry_update();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS journal_entries_restrict_update ON journal_entries")
    op.execute("DROP FUNCTION IF EXISTS restrict_journal_entry_update()")
    op.execute("DROP TRIGGER IF EXISTS journal_entries_no_delete ON journal_entries")
    op.execute("DROP FUNCTION IF EXISTS prevent_journal_entry_delete()")
    op.execute("DROP TRIGGER IF EXISTS journal_entry_lines_immutable ON journal_entry_lines")
    op.execute("DROP FUNCTION IF EXISTS prevent_journal_line_mutation()")

    op.execute("DROP POLICY IF EXISTS ledger_audit_events_entity_isolation ON ledger_audit_events")
    op.drop_index(op.f("ix_ledger_audit_events_journal_entry_id"), table_name="ledger_audit_events")
    op.drop_index(op.f("ix_ledger_audit_events_entity_id"), table_name="ledger_audit_events")
    op.drop_table("ledger_audit_events")

    op.drop_constraint(
        op.f("fk_journal_entry_lines_journal_entry_id_journal_entries"),
        "journal_entry_lines",
        type_="foreignkey",
    )
    op.create_foreign_key(
        op.f("fk_journal_entry_lines_journal_entry_id_journal_entries"),
        "journal_entry_lines",
        "journal_entries",
        ["journal_entry_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_constraint(
        op.f("fk_journal_entries_reversed_by_entry_id_journal_entries"),
        "journal_entries",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_journal_entries_reverses_entry_id_journal_entries"),
        "journal_entries",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_journal_entries_reversed_by_entry_id"), table_name="journal_entries")
    op.drop_index(op.f("ix_journal_entries_reverses_entry_id"), table_name="journal_entries")
    op.drop_column("journal_entries", "voided_at")
    op.drop_column("journal_entries", "reversed_by_entry_id")
    op.drop_column("journal_entries", "reverses_entry_id")
    op.drop_column("journal_entries", "status")
