"""Alembic provisioning — same path as production."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.db.bootstrap import ensure_test_database
from app.db.provisioning import (
    AUDIT_IMMUTABILITY_TRIGGERS,
    LEDGER_IMMUTABILITY_TRIGGERS,
    PERIOD_LOCKS_IMMUTABILITY_TRIGGERS,
    audit_immutability_triggers_present,
    ledger_immutability_triggers_present,
    period_locks_immutability_triggers_present,
    provision_database_via_alembic,
)
from app.db.rls import RLS_TABLES
from tests.test_security_invariants import _entity_scoped_table_names


PROVISION_TEST_DB = "mizan_alembic_provision_test"


@pytest.fixture(scope="module")
def alembic_provisioned_url() -> str:
    """Empty database provisioned only via ``alembic upgrade head``."""
    ensure_test_database()
    admin_base = settings.test_database_admin_url.rsplit("/", 1)[0]
    app_base = settings.test_database_url.rsplit("/", 1)[0]
    admin_url = f"{admin_base}/{PROVISION_TEST_DB}"
    app_url = f"{app_base}/{PROVISION_TEST_DB}"

    admin_engine = create_engine(settings.database_admin_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        conn.execute(
            text(
                f"""
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = '{PROVISION_TEST_DB}' AND pid <> pg_backend_pid()
                """
            )
        )
        conn.execute(text(f'DROP DATABASE IF EXISTS "{PROVISION_TEST_DB}"'))
        conn.execute(text(f'CREATE DATABASE "{PROVISION_TEST_DB}" OWNER mizan'))
        conn.execute(
            text(f'GRANT ALL PRIVILEGES ON DATABASE "{PROVISION_TEST_DB}" TO mizan_app')
        )
    admin_engine.dispose()

    provision_database_via_alembic(app_url, admin_url=admin_url)
    yield app_url

    admin_engine = create_engine(settings.database_admin_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        conn.execute(
            text(
                f"""
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = '{PROVISION_TEST_DB}' AND pid <> pg_backend_pid()
                """
            )
        )
        conn.execute(text(f'DROP DATABASE IF EXISTS "{PROVISION_TEST_DB}"'))
    admin_engine.dispose()


def test_alembic_upgrade_head_on_empty_database(alembic_provisioned_url: str) -> None:
    engine = create_engine(alembic_provisioned_url, pool_pre_ping=True)
    with engine.connect() as conn:
        version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        expected_head = ScriptDirectory.from_config(cfg).get_current_head()
        assert version == expected_head
        legal_name_col = conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'entities' "
                "AND column_name = 'legal_name'"
            )
        ).scalar()
        assert legal_name_col == "legal_name"
        table_count = conn.execute(
            text(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
            )
        ).scalar()
        assert table_count >= len(RLS_TABLES)
    engine.dispose()


def test_alembic_provisioning_installs_rls_policies(alembic_provisioned_url: str) -> None:
    engine = create_engine(alembic_provisioned_url, pool_pre_ping=True)
    session = sessionmaker(bind=engine)()
    tables = sorted(_entity_scoped_table_names())
    rows = session.execute(
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
    session.close()
    engine.dispose()

    by_name = {row.table_name: row for row in rows}
    failures: list[str] = []
    for table in tables:
        row = by_name.get(table)
        if row is None:
            failures.append(f"{table}: table not found")
            continue
        if not row.rls_enabled:
            failures.append(f"{table}: RLS not enabled")
        if row.policy_count < 1:
            failures.append(f"{table}: no RLS policy")

    assert not failures, "Alembic provisioning RLS gaps:\n" + "\n".join(failures)


def test_alembic_provisioning_installs_ledger_immutability_triggers(
    alembic_provisioned_url: str,
) -> None:
    engine = create_engine(alembic_provisioned_url, pool_pre_ping=True)
    with engine.connect() as conn:
        present = frozenset(ledger_immutability_triggers_present(conn))
    engine.dispose()

    missing = LEDGER_IMMUTABILITY_TRIGGERS - present
    assert not missing, f"Missing ledger immutability triggers: {sorted(missing)}"


def test_alembic_provisioning_installs_audit_immutability_triggers(
    alembic_provisioned_url: str,
) -> None:
    engine = create_engine(alembic_provisioned_url, pool_pre_ping=True)
    with engine.connect() as conn:
        present = frozenset(audit_immutability_triggers_present(conn))
    engine.dispose()

    missing = AUDIT_IMMUTABILITY_TRIGGERS - present
    assert not missing, f"Missing audit immutability triggers: {sorted(missing)}"


def test_alembic_provisioning_installs_period_lock_immutability_triggers(
    alembic_provisioned_url: str,
) -> None:
    engine = create_engine(alembic_provisioned_url, pool_pre_ping=True)
    with engine.connect() as conn:
        present = frozenset(period_locks_immutability_triggers_present(conn))
    engine.dispose()

    missing = PERIOD_LOCKS_IMMUTABILITY_TRIGGERS - present
    assert not missing, f"Missing period lock immutability triggers: {sorted(missing)}"


def test_verify_production_database_passes_after_alembic(alembic_provisioned_url: str) -> None:
    from app.db.provisioning import verify_production_database

    verify_production_database(alembic_provisioned_url)


def test_run_production_migrations_is_idempotent_on_provisioned_db(
    alembic_provisioned_url: str,
) -> None:
    from app.db.provisioning import run_production_migrations, verify_production_database

    original_migration_url = settings.database_url
    try:
        settings.database_url = alembic_provisioned_url
        run_production_migrations()
        verify_production_database(alembic_provisioned_url)
    finally:
        settings.database_url = original_migration_url
