"""PostgreSQL triggers enforcing ledger immutability at the DB layer."""

from sqlalchemy import text
from sqlalchemy.engine import Connection

PREVENT_JOURNAL_LINE_MUTATION = """
CREATE OR REPLACE FUNCTION prevent_journal_line_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'journal entry lines are immutable';
END;
$$ LANGUAGE plpgsql;
"""

PREVENT_JOURNAL_ENTRY_DELETE = """
CREATE OR REPLACE FUNCTION prevent_journal_entry_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'journal entries cannot be deleted';
END;
$$ LANGUAGE plpgsql;
"""

RESTRICT_JOURNAL_ENTRY_UPDATE = """
CREATE OR REPLACE FUNCTION restrict_journal_entry_update()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.entry_date IS DISTINCT FROM NEW.entry_date
       OR OLD.description IS DISTINCT FROM NEW.description
       OR OLD.entity_id IS DISTINCT FROM NEW.entity_id
       OR OLD.source IS DISTINCT FROM NEW.source
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.reverses_entry_id IS DISTINCT FROM NEW.reverses_entry_id
       OR OLD.amends_entry_id IS DISTINCT FROM NEW.amends_entry_id
    THEN
        RAISE EXCEPTION 'journal entries are immutable except void metadata';
    END IF;

    IF (OLD.status IS DISTINCT FROM NEW.status
        OR OLD.reversed_by_entry_id IS DISTINCT FROM NEW.reversed_by_entry_id
        OR OLD.amended_by_entry_id IS DISTINCT FROM NEW.amended_by_entry_id
        OR OLD.voided_at IS DISTINCT FROM NEW.voided_at)
       AND current_setting('app.journal_void_update', true) IS DISTINCT FROM '1'
    THEN
        RAISE EXCEPTION 'journal void metadata updates require app.journal_void_update gate';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

PREVENT_LEDGER_AUDIT_EVENT_MUTATION = """
CREATE OR REPLACE FUNCTION prevent_ledger_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'ledger audit events are append-only';
END;
$$ LANGUAGE plpgsql;
"""


def apply_ledger_immutability(connection: Connection) -> None:
    """Install or refresh ledger immutability triggers (idempotent)."""
    connection.execute(text(PREVENT_JOURNAL_LINE_MUTATION))
    connection.execute(
        text("DROP TRIGGER IF EXISTS journal_entry_lines_immutable ON journal_entry_lines")
    )
    connection.execute(
        text(
            """
            CREATE TRIGGER journal_entry_lines_immutable
            BEFORE UPDATE OR DELETE ON journal_entry_lines
            FOR EACH ROW EXECUTE FUNCTION prevent_journal_line_mutation();
            """
        )
    )

    connection.execute(text(PREVENT_JOURNAL_ENTRY_DELETE))
    connection.execute(
        text("DROP TRIGGER IF EXISTS journal_entries_no_delete ON journal_entries")
    )
    connection.execute(
        text(
            """
            CREATE TRIGGER journal_entries_no_delete
            BEFORE DELETE ON journal_entries
            FOR EACH ROW EXECUTE FUNCTION prevent_journal_entry_delete();
            """
        )
    )

    connection.execute(text(RESTRICT_JOURNAL_ENTRY_UPDATE))
    connection.execute(
        text("DROP TRIGGER IF EXISTS journal_entries_restrict_update ON journal_entries")
    )
    connection.execute(
        text(
            """
            CREATE TRIGGER journal_entries_restrict_update
            BEFORE UPDATE ON journal_entries
            FOR EACH ROW EXECUTE FUNCTION restrict_journal_entry_update();
            """
        )
    )

    connection.execute(text(PREVENT_LEDGER_AUDIT_EVENT_MUTATION))
    connection.execute(
        text(
            "DROP TRIGGER IF EXISTS ledger_audit_events_append_only ON ledger_audit_events"
        )
    )
    connection.execute(
        text(
            """
            CREATE TRIGGER ledger_audit_events_append_only
            BEFORE UPDATE OR DELETE ON ledger_audit_events
            FOR EACH ROW EXECUTE FUNCTION prevent_ledger_audit_event_mutation();
            """
        )
    )
