"""PostgreSQL triggers enforcing partner ledger immutability."""

from sqlalchemy import text
from sqlalchemy.engine import Connection

PREVENT_PARTNER_LEDGER_MUTATION = """
CREATE OR REPLACE FUNCTION prevent_partner_ledger_entry_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'partner ledger entries are immutable';
END;
$$ LANGUAGE plpgsql;
"""


def apply_partners_immutability(connection: Connection) -> None:
    """Install or refresh partner ledger immutability triggers (idempotent)."""
    connection.execute(text(PREVENT_PARTNER_LEDGER_MUTATION))
    connection.execute(
        text(
            "DROP TRIGGER IF EXISTS partner_ledger_entries_immutable "
            "ON partner_ledger_entries"
        )
    )
    connection.execute(
        text(
            """
            CREATE TRIGGER partner_ledger_entries_immutable
            BEFORE UPDATE OR DELETE ON partner_ledger_entries
            FOR EACH ROW EXECUTE FUNCTION prevent_partner_ledger_entry_mutation();
            """
        )
    )
