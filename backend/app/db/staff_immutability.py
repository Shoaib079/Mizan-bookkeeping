"""PostgreSQL triggers enforcing staff ledger immutability."""

from sqlalchemy import text
from sqlalchemy.engine import Connection

PREVENT_STAFF_LEDGER_MUTATION = """
CREATE OR REPLACE FUNCTION prevent_staff_ledger_entry_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'staff ledger entries are immutable';
END;
$$ LANGUAGE plpgsql;
"""


def apply_staff_immutability(connection: Connection) -> None:
    """Install or refresh staff ledger immutability triggers (idempotent)."""
    connection.execute(text(PREVENT_STAFF_LEDGER_MUTATION))
    connection.execute(
        text(
            "DROP TRIGGER IF EXISTS staff_ledger_entries_immutable "
            "ON staff_ledger_entries"
        )
    )
    connection.execute(
        text(
            """
            CREATE TRIGGER staff_ledger_entries_immutable
            BEFORE UPDATE OR DELETE ON staff_ledger_entries
            FOR EACH ROW EXECUTE FUNCTION prevent_staff_ledger_entry_mutation();
            """
        )
    )
