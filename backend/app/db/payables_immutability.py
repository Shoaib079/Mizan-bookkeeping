"""PostgreSQL triggers enforcing supplier payables ledger immutability."""

from sqlalchemy import text
from sqlalchemy.engine import Connection

PREVENT_SUPPLIER_LEDGER_MUTATION = """
CREATE OR REPLACE FUNCTION prevent_supplier_ledger_entry_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'supplier ledger entries are immutable';
END;
$$ LANGUAGE plpgsql;
"""


def apply_payables_immutability(connection: Connection) -> None:
    """Install or refresh payables ledger immutability triggers (idempotent)."""
    connection.execute(text(PREVENT_SUPPLIER_LEDGER_MUTATION))
    connection.execute(
        text(
            "DROP TRIGGER IF EXISTS supplier_ledger_entries_immutable "
            "ON supplier_ledger_entries"
        )
    )
    connection.execute(
        text(
            """
            CREATE TRIGGER supplier_ledger_entries_immutable
            BEFORE UPDATE OR DELETE ON supplier_ledger_entries
            FOR EACH ROW EXECUTE FUNCTION prevent_supplier_ledger_entry_mutation();
            """
        )
    )
