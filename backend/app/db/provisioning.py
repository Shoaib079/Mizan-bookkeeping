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
from alembic.script import ScriptDirectory
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


class ProductionDatabaseVerificationError(RuntimeError):
    """Raised when a production database fails post-migrate integrity checks."""


def expected_alembic_head() -> str:
    """Current Alembic head revision id (must match ``alembic_version.version_num``)."""
    cfg = alembic_config(settings.database_migration_url)
    script = ScriptDirectory.from_config(cfg)
    head = script.get_current_head()
    if head is None:
        raise RuntimeError("Alembic has no head revision")
    return head


def run_production_migrations() -> None:
    """Apply ``alembic upgrade head`` on the app database — no schema drop.

    ``finalize_migration_grants()`` runs automatically via ``alembic/env.py`` after migrate.
    """
    migrate_url = settings.database_migration_url
    command.upgrade(alembic_config(migrate_url), "head")


def _entity_scoped_table_names() -> frozenset[str]:
    from app.db.rls import RLS_TABLES

    return frozenset(RLS_TABLES)


def _required_named_rls_policies() -> frozenset[tuple[str, str]]:
    """(table, policy_name) pairs beyond the default entity_isolation policy."""
    return frozenset(
        {
            ("accounts", "accounts_posting_lookup"),
            ("entity_memberships", "entity_memberships_user_lookup"),
        }
    )


def verify_production_database(database_url: str | None = None) -> None:
    """Assert Alembic head, RLS policies, and immutability triggers are present."""
    url = database_url or settings.database_url
    engine = create_engine(url, pool_pre_ping=True)
    failures: list[str] = []
    try:
        with engine.connect() as conn:
            version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            expected_head = expected_alembic_head()
            if version != expected_head:
                failures.append(
                    f"alembic_version={version!r} (expected head {expected_head!r})"
                )

            tables = sorted(_entity_scoped_table_names())
            rows = conn.execute(
                text(
                    """
                    SELECT c.relname AS table_name,
                           c.relrowsecurity AS rls_enabled,
                           COUNT(p.policyname)::int AS policy_count
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    LEFT JOIN pg_policies p
                      ON p.tablename = c.relname AND p.schemaname = n.nspname
                    WHERE n.nspname = 'public'
                      AND c.relkind = 'r'
                      AND c.relname = ANY(:tables)
                    GROUP BY c.relname, c.relrowsecurity
                    """
                ),
                {"tables": tables},
            ).all()
            by_name = {row.table_name: row for row in rows}
            for table in tables:
                row = by_name.get(table)
                if row is None:
                    failures.append(f"{table}: table not found")
                    continue
                if not row.rls_enabled:
                    failures.append(f"{table}: RLS not enabled")
                if row.policy_count < 1:
                    failures.append(f"{table}: no RLS policy")

            for table, policy_name in _required_named_rls_policies():
                exists = conn.execute(
                    text(
                        """
                        SELECT 1 FROM pg_policies
                        WHERE schemaname = 'public'
                          AND tablename = :table
                          AND policyname = :policy
                        """
                    ),
                    {"table": table, "policy": policy_name},
                ).scalar()
                if not exists:
                    failures.append(f"{table}: missing policy {policy_name!r}")

            ledger_present = frozenset(ledger_immutability_triggers_present(conn))
            missing_ledger = LEDGER_IMMUTABILITY_TRIGGERS - ledger_present
            if missing_ledger:
                failures.append(
                    f"missing ledger immutability triggers: {sorted(missing_ledger)}"
                )

            audit_present = frozenset(audit_immutability_triggers_present(conn))
            missing_audit = AUDIT_IMMUTABILITY_TRIGGERS - audit_present
            if missing_audit:
                failures.append(
                    f"missing audit immutability triggers: {sorted(missing_audit)}"
                )

            period_present = frozenset(period_locks_immutability_triggers_present(conn))
            missing_period = PERIOD_LOCKS_IMMUTABILITY_TRIGGERS - period_present
            if missing_period:
                failures.append(
                    f"missing period lock immutability triggers: {sorted(missing_period)}"
                )
    finally:
        engine.dispose()

    if failures:
        raise ProductionDatabaseVerificationError(
            "Production database verification failed:\n" + "\n".join(failures)
        )


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
