"""Subledger entry immutability — registry + trigger presence checks (Phase 8.6 Item 6)."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Connection

IMMUTABLE_SUBLEDGER_TABLES = frozenset(
    {
        "supplier_ledger_entries",
        "customer_ledger_entries",
        "staff_ledger_entries",
        "partner_ledger_entries",
        "fx_ledger_entries",
    }
)


def subledger_immutability_trigger_name(table_name: str) -> str:
    return f"{table_name}_immutable"


SUBLEDGER_IMMUTABILITY_TRIGGERS = frozenset(
    subledger_immutability_trigger_name(table) for table in IMMUTABLE_SUBLEDGER_TABLES
)


def discover_subledger_entry_tables() -> frozenset[str]:
    """All SQLAlchemy models whose table name ends with ``_ledger_entries``."""
    import app.db.bootstrap  # noqa: F401 — load model registry

    from app.db.base import EntityScopedMixin

    tables: set[str] = set()

    def walk(cls: type) -> None:
        for sub in cls.__subclasses__():
            tablename = getattr(sub, "__tablename__", None)
            if tablename and tablename.endswith("_ledger_entries"):
                tables.add(tablename)
            walk(sub)

    walk(EntityScopedMixin)
    return frozenset(tables)


def verify_subledger_immutability_registry_complete() -> None:
    """Fail fast if a *_ledger_entries table is missing from the immutability registry."""
    discovered = discover_subledger_entry_tables()
    missing = discovered - IMMUTABLE_SUBLEDGER_TABLES
    extra = IMMUTABLE_SUBLEDGER_TABLES - discovered
    if missing or extra:
        raise AssertionError(
            f"subledger immutability registry incomplete: "
            f"missing={sorted(missing)!r} extra={sorted(extra)!r}"
        )


def subledger_immutability_triggers_present(connection: Connection) -> list[str]:
    """Return immutability trigger names installed on subledger entry tables."""
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
        {"tables": list(IMMUTABLE_SUBLEDGER_TABLES)},
    ).scalars()
    return list(rows)
