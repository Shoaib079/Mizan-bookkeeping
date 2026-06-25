"""Canonical PostgreSQL provisioning — production uses Alembic only.

Production and CI test databases MUST be built with::

    cd backend && alembic upgrade head

That runs all schema migrations through head, including the final integrity
migration which idempotently applies RLS policies for every ``RLS_TABLES``
entry (plus ``accounts_posting_lookup`` and ``entity_memberships_user_lookup``)
and all ledger/subledger immutability triggers.

``init_database()`` (SQLAlchemy ``create_all`` + integrity helpers) exists for
optional local bootstrap only — never for production deploys.
"""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

from app.db.audit_immutability import (
    IMMUTABLE_AUDIT_TABLES,
    apply_audit_immutability,
    audit_immutability_trigger_name,
    audit_immutability_triggers_present,
)
from app.db.fx_immutability import apply_fx_immutability
from app.db.ledger_immutability import apply_ledger_immutability
from app.db.partners_immutability import apply_partners_immutability
from app.db.payables_immutability import apply_payables_immutability
from app.db.period_locks_immutability import (
    PERIOD_LOCKS_NO_DELETE_TRIGGER,
    apply_period_locks_immutability,
    period_locks_immutability_triggers_present,
)
from app.db.receivables_immutability import apply_receivables_immutability
from app.db.rls import apply_entity_rls
from app.db.staff_immutability import apply_staff_immutability
from app.config import settings

APP_DB_ROLE = "mizan_app"

LEDGER_IMMUTABILITY_TRIGGERS = frozenset(
    {
        "journal_entry_lines_immutable",
        "journal_entries_no_delete",
        "journal_entries_restrict_update",
    }
)

AUDIT_IMMUTABILITY_TRIGGERS = frozenset(
    audit_immutability_trigger_name(table) for table in IMMUTABLE_AUDIT_TABLES
)

PERIOD_LOCKS_IMMUTABILITY_TRIGGERS = frozenset({PERIOD_LOCKS_NO_DELETE_TRIGGER})


def apply_database_integrity(connection: Connection) -> None:
    """Idempotent RLS policies + immutability triggers (production migration tail)."""
    apply_entity_rls(connection)
    apply_ledger_immutability(connection)
    apply_audit_immutability(connection)
    apply_period_locks_immutability(connection)
    apply_payables_immutability(connection)
    apply_fx_immutability(connection)
    apply_staff_immutability(connection)
    apply_partners_immutability(connection)
    apply_receivables_immutability(connection)


def finalize_migration_grants(migration_url: str) -> None:
    """After ``alembic upgrade head``: ensure ``mizan_app`` exists and grant DML on all objects."""
    from app.db.bootstrap import ensure_mizan_app_role

    admin_engine = create_engine(settings.database_cluster_admin_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        ensure_mizan_app_role(conn)
    admin_engine.dispose()

    engine = create_engine(migration_url, pool_pre_ping=True)
    with engine.begin() as connection:
        grant_app_role_privileges(connection)
    engine.dispose()


def grant_app_role_privileges(connection: Connection) -> None:
    """Grant mizan_app DML on all objects — app connects as non-superuser for RLS."""
    connection.execute(text(f"GRANT USAGE ON SCHEMA public TO {APP_DB_ROLE}"))
    connection.execute(
        text(
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {APP_DB_ROLE}"
        )
    )
    connection.execute(
        text(f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {APP_DB_ROLE}")
    )
    connection.execute(
        text(
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {APP_DB_ROLE}"
        )
    )


def reset_public_schema(engine: Engine) -> None:
    """Drop and recreate public schema (empty database shell for Alembic)."""
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
        connection.execute(text("GRANT ALL ON SCHEMA public TO PUBLIC"))
        connection.execute(text("GRANT ALL ON SCHEMA public TO mizan"))
        connection.execute(text(f"GRANT ALL ON SCHEMA public TO {APP_DB_ROLE}"))


def alembic_config(database_url: str) -> Config:
    backend_dir = Path(__file__).resolve().parents[2]
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", database_url)
    return cfg


def provision_database_via_alembic(
    database_url: str,
    *,
    admin_url: str | None = None,
) -> None:
    """Reset schema and apply ``alembic upgrade head`` (canonical path).

    ``admin_url`` — superuser/migrator connection (schema reset). Defaults to ``database_url``.
    ``database_url`` — retained for callers; grants are applied after migrate.
    """
    migrate_url = admin_url or database_url
    engine = create_engine(migrate_url, pool_pre_ping=True)
    reset_public_schema(engine)
    command.upgrade(alembic_config(migrate_url), "head")
    finalize_migration_grants(migrate_url)
    engine.dispose()


def ledger_immutability_triggers_present(connection: Connection) -> list[str]:
    """Return ledger immutability trigger names present in the database."""
    rows = connection.execute(
        text(
            """
            SELECT t.tgname
            FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND NOT t.tgisinternal
              AND c.relname IN (
                  'journal_entries', 'journal_entry_lines'
              )
            """
        )
    ).scalars()
    return list(rows)
