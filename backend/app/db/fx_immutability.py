"""PostgreSQL triggers enforcing FX subledger immutability."""

from sqlalchemy import text
from sqlalchemy.engine import Connection

PREVENT_FX_LEDGER_MUTATION = """
CREATE OR REPLACE FUNCTION prevent_fx_ledger_entry_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'fx ledger entries are immutable';
END;
$$ LANGUAGE plpgsql;
"""


def apply_fx_immutability(connection: Connection) -> None:
    """Install or refresh FX ledger immutability triggers (idempotent)."""
    connection.execute(text(PREVENT_FX_LEDGER_MUTATION))
    connection.execute(
        text("DROP TRIGGER IF EXISTS fx_ledger_entries_immutable ON fx_ledger_entries")
    )
    connection.execute(
        text(
            """
            CREATE TRIGGER fx_ledger_entries_immutable
            BEFORE UPDATE OR DELETE ON fx_ledger_entries
            FOR EACH ROW EXECUTE FUNCTION prevent_fx_ledger_entry_mutation();
            """
        )
    )
