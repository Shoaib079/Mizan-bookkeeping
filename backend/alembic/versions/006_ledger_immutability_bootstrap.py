"""Harden ledger immutability triggers (void gate + audit append-only)."""

from typing import Sequence, Union

from alembic import op

from app.db.ledger_immutability import apply_ledger_immutability

revision: str = "006_ledger_immutability_bootstrap"
down_revision: Union[str, None] = "005_ledger_void_audit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Alembic defaults to varchar(32); several revision ids exceed that length.
    op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE varchar(64)")
    bind = op.get_bind()
    apply_ledger_immutability(bind)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS ledger_audit_events_append_only ON ledger_audit_events")
    op.execute("DROP FUNCTION IF EXISTS prevent_ledger_audit_event_mutation()")
    op.execute("DROP TRIGGER IF EXISTS journal_entries_restrict_update ON journal_entries")
    op.execute("DROP FUNCTION IF EXISTS restrict_journal_entry_update()")
    op.execute("DROP TRIGGER IF EXISTS journal_entries_no_delete ON journal_entries")
    op.execute("DROP FUNCTION IF EXISTS prevent_journal_entry_delete()")
    op.execute("DROP TRIGGER IF EXISTS journal_entry_lines_immutable ON journal_entry_lines")
    op.execute("DROP FUNCTION IF EXISTS prevent_journal_line_mutation()")
