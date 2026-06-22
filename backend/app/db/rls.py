"""PostgreSQL row-level security policies for entity isolation."""

from sqlalchemy import text
from sqlalchemy.engine import Connection

RLS_TABLES = (
    "entity_settings",
    "accounts",
    "journal_entries",
    "journal_entry_lines",
    "ledger_audit_events",
    "invoice_drafts",
    "suppliers",
    "supplier_ledger_entries",
    "money_accounts",
    "bank_statements",
    "bank_statement_lines",
    "account_transfers",
    "pos_settlements",
    "card_sales_batches",
    "credit_card_payments",
    "cash_drawer_sessions",
    "cash_movements",
    "fx_ledger_entries",
    "employees",
    "staff_ledger_entries",
    "partners",
    "partner_ledger_entries",
)


def apply_entity_rls(connection: Connection) -> None:
    """Enable RLS and policies: rows visible only when entity_id matches session setting."""
    for table in RLS_TABLES:
        connection.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
        connection.execute(text(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"))
        connection.execute(text(f"DROP POLICY IF EXISTS {table}_entity_isolation ON {table}"))
        connection.execute(
            text(
                f"""
                CREATE POLICY {table}_entity_isolation ON {table}
                FOR ALL
                USING (
                    entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
                )
                WITH CHECK (
                    entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
                )
                """
            )
        )

    connection.execute(text("DROP POLICY IF EXISTS accounts_posting_lookup ON accounts"))
    connection.execute(
        text(
            """
            CREATE POLICY accounts_posting_lookup ON accounts
            FOR SELECT
            USING (current_setting('app.posting_lookup', true) = '1')
            """
        )
    )
