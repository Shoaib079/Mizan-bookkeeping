"""PostgreSQL triggers — period locks are not deletable (Phase 8.5 Slice 4)."""

from sqlalchemy import text
from sqlalchemy.engine import Connection

PERIOD_LOCKS_NO_DELETE_TRIGGER = "period_locks_no_delete"

PREVENT_PERIOD_LOCK_DELETE = """
CREATE OR REPLACE FUNCTION prevent_period_lock_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'period locks cannot be deleted';
END;
$$ LANGUAGE plpgsql;
"""


def apply_period_locks_immutability(connection: Connection) -> None:
    """Install or refresh period lock delete protection (idempotent)."""
    exists = connection.execute(
        text("SELECT to_regclass('public.period_locks') IS NOT NULL")
    ).scalar()
    if not exists:
        return
    connection.execute(text(PREVENT_PERIOD_LOCK_DELETE))
    connection.execute(
        text("DROP TRIGGER IF EXISTS period_locks_no_delete ON period_locks")
    )
    connection.execute(
        text(
            """
            CREATE TRIGGER period_locks_no_delete
            BEFORE DELETE ON period_locks
            FOR EACH ROW EXECUTE FUNCTION prevent_period_lock_delete();
            """
        )
    )


def period_locks_immutability_triggers_present(connection: Connection) -> list[str]:
    """Return period lock immutability trigger names present in the database."""
    rows = connection.execute(
        text(
            """
            SELECT t.tgname
            FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND NOT t.tgisinternal
              AND c.relname = 'period_locks'
            """
        )
    ).scalars()
    return list(rows)
