"""Append-only immutability for audit event tables — registry + triggers."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Connection

IMMUTABLE_AUDIT_TABLES = frozenset(
    {
        "ledger_audit_events",
        "auth_audit_events",
        "period_lock_audit_events",
    }
)

PREVENT_IMMUTABLE_AUDIT_EVENT_MUTATION = """
CREATE OR REPLACE FUNCTION prevent_immutable_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit events are append-only on %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
"""


def audit_immutability_trigger_name(table_name: str) -> str:
    return f"{table_name}_append_only"


def _table_exists(connection: Connection, table_name: str) -> bool:
    return bool(
        connection.execute(
            text("SELECT to_regclass(:qualified_name) IS NOT NULL"),
            {"qualified_name": f"public.{table_name}"},
        ).scalar()
    )


def apply_audit_immutability(connection: Connection) -> None:
    """Install or refresh append-only triggers for every IMMUTABLE_AUDIT_TABLES entry."""
    connection.execute(text(PREVENT_IMMUTABLE_AUDIT_EVENT_MUTATION))
    for table_name in sorted(IMMUTABLE_AUDIT_TABLES):
        if not _table_exists(connection, table_name):
            continue
        trigger_name = audit_immutability_trigger_name(table_name)
        connection.execute(
            text(f"DROP TRIGGER IF EXISTS {trigger_name} ON {table_name}")
        )
        connection.execute(
            text(
                f"""
                CREATE TRIGGER {trigger_name}
                BEFORE UPDATE OR DELETE ON {table_name}
                FOR EACH ROW EXECUTE FUNCTION prevent_immutable_audit_event_mutation();
                """
            )
        )


def audit_immutability_triggers_present(connection: Connection) -> list[str]:
    """Return append-only audit trigger names present in the database."""
    rows = connection.execute(
        text(
            """
            SELECT t.tgname
            FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND NOT t.tgisinternal
              AND c.relname = ANY(:tables)
            """
        ),
        {"tables": list(IMMUTABLE_AUDIT_TABLES)},
    ).scalars()
    return list(rows)


def discover_audit_event_tables() -> frozenset[str]:
    """All SQLAlchemy models whose table name ends with ``_audit_events``."""
    import app.db.bootstrap  # noqa: F401 — load model registry

    from app.db.base import Base

    tables: set[str] = set()

    def walk(cls: type) -> None:
        for sub in cls.__subclasses__():
            tablename = getattr(sub, "__tablename__", None)
            if tablename and tablename.endswith("_audit_events"):
                tables.add(tablename)
            walk(sub)

    walk(Base)
    return frozenset(tables)
