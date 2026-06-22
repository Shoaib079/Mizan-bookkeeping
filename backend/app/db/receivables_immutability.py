"""PostgreSQL triggers enforcing customer receivables ledger immutability."""

from sqlalchemy import text
from sqlalchemy.engine import Connection

PREVENT_CUSTOMER_LEDGER_MUTATION = """
CREATE OR REPLACE FUNCTION prevent_customer_ledger_entry_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'customer ledger entries are immutable';
END;
$$ LANGUAGE plpgsql;
"""


def apply_receivables_immutability(connection: Connection) -> None:
    """Install or refresh receivables ledger immutability triggers (idempotent)."""
    connection.execute(text(PREVENT_CUSTOMER_LEDGER_MUTATION))
    connection.execute(
        text(
            "DROP TRIGGER IF EXISTS customer_ledger_entries_immutable "
            "ON customer_ledger_entries"
        )
    )
    connection.execute(
        text(
            """
            CREATE TRIGGER customer_ledger_entries_immutable
            BEFORE UPDATE OR DELETE ON customer_ledger_entries
            FOR EACH ROW EXECUTE FUNCTION prevent_customer_ledger_entry_mutation();
            """
        )
    )
