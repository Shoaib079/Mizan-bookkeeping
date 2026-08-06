"""Pytest fixtures — PostgreSQL test database with RLS (entity isolation tests).

**Read an ORM object's id before you commit, not after.**

A commit expires every loaded attribute, so the next attribute access goes
back to the database. Outside `entity_context` the row-level security policy
hides the row, and SQLAlchemy concludes it was deleted — the error is
`ObjectDeletedError`, which says nothing about RLS and sends you looking for a
delete that never happened.

    with entity_context(db_session, entity_id):
        ...
        db_session.commit()
        customer_id = customer.id      # while the context is open
    resp = client.post(f".../customers/{customer_id}/...")

The trap is easy to miss because it only fires when something commits *after*
you hold the object — creating a second record, for instance — so a test can
pass for a year and then break when a line is added above it. Entity-scoped
tables are all affected; `entities` itself is not, which is why
`restaurant_a.id` can be read anywhere.
"""

from __future__ import annotations

import re
import threading
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

# Test suite defaults — must be set before importing app (launch validation).
settings.auth_enforcement = False
settings.clerk_test_mode = True
settings.idempotency_enforcement = False
settings.app_env = "test"

from app.db.bootstrap import ensure_test_database
from app.db.provisioning import APP_DB_ROLE, provision_database_via_alembic
from app.db.session import get_session
from app.features.entities.models import Entity, EntitySetting
from app.main import app


def _dependencies_missing_from_environment() -> list[str]:
    """Distribution names pyproject declares that this interpreter can't see."""
    import tomllib
    from importlib.metadata import PackageNotFoundError, version
    from pathlib import Path

    pyproject = Path(__file__).resolve().parent.parent / "pyproject.toml"
    if not pyproject.exists():  # installed elsewhere; nothing to compare against
        return []

    project = tomllib.loads(pyproject.read_text()).get("project", {})
    declared = list(project.get("dependencies", []))
    declared += list(project.get("optional-dependencies", {}).get("dev", []))

    missing = []
    for requirement in declared:
        # "sentry-sdk[fastapi]>=2.0" -> "sentry-sdk"; also handles bare names,
        # extras, and environment markers ("pkg; python_version < '3.12'").
        name = re.split(r"[\[<>=!~;\s]", requirement, maxsplit=1)[0].strip()
        if not name:
            continue
        try:
            version(name)
        except PackageNotFoundError:
            missing.append(name)
    return missing


def pytest_sessionstart(session) -> None:
    """Refuse to run against an environment that doesn't match pyproject.toml.

    A dependency added to pyproject but never installed locally doesn't fail
    loudly — it fails as a handful of unrelated-looking tests deep in the run
    (`No module named 'xlrd'` inside a bank-statement parser test), which reads
    like a code regression rather than a stale venv. That cost a debugging
    round on 2026-07-29, and the real risk is the opposite mistake: shrugging
    off a failure as "just my environment" when it's a genuinely missing
    dependency that will break production too.

    Read from pyproject rather than the installed metadata on purpose —
    `importlib.metadata.requires()` reports what was declared *at install
    time*, so it goes stale in exactly the case this is meant to catch.
    """
    try:
        missing = _dependencies_missing_from_environment()
    except Exception:
        # A convenience check must never be the reason the suite can't run.
        # If reading or parsing pyproject fails, say nothing and let the tests
        # speak for themselves.
        return

    if missing:
        raise pytest.UsageError(
            "Environment is out of date with pyproject.toml — not installed: "
            + ", ".join(sorted(missing))
            + "\n  Fix:  python3 -m pip install -e \".[dev]\""
            + "\n  If that reports success but this still fires, pip is installing"
            + " into a different interpreter than pytest is using;"
            + " run both through `python3 -m` from an activated venv (see DEV.md)."
        )


@pytest.fixture(scope="session", autouse=True)
def isolated_upload_dir(tmp_path_factory):
    """Keep uploads off backend/data/ — one temp dir per pytest run."""
    path = tmp_path_factory.mktemp("uploads")
    settings.upload_dir = str(path)
    yield path


@pytest.fixture(scope="session")
def test_engine():
    ensure_test_database()
    provision_database_via_alembic(
        settings.test_database_url,
        admin_url=settings.test_database_admin_url,
    )
    # Migrations run as admin (table owner); mizan_app gets DML only. Tests need TRUNCATE
    # for per-test cleanup — grant test-only (not in production grant_app_role_privileges).
    admin_engine = create_engine(settings.test_database_admin_url, pool_pre_ping=True)
    with admin_engine.begin() as conn:
        conn.execute(
            text(f"GRANT TRUNCATE ON ALL TABLES IN SCHEMA public TO {APP_DB_ROLE}")
        )
    admin_engine.dispose()
    engine = create_engine(
        settings.test_database_url,
        pool_pre_ping=True,
        connect_args={"options": "-c TimeZone=UTC"},
    )
    yield engine
    engine.dispose()


_TRUNCATE_TEST_TABLES = text(
    "TRUNCATE ledger_audit_events, journal_entry_lines, journal_entries, "
    "bank_statement_lines, bank_statements, account_transfers, pos_settlements, "
    "delivery_settlements, delivery_reports, delivery_platforms, "
    "card_sales_batches, pos_daily_summaries, credit_card_payments, fx_ledger_entries, "
    "staff_ledger_entries, employees, partner_ledger_entries, partners, "
    "cash_movements, cash_drawer_sessions, cash_drawer_audit_events, "
    "expense_entries, expense_receipt_lines, expense_receipt_intakes, expense_item_aliases, expense_items, "
    "entity_memberships, users, auth_audit_events, idempotency_records, "
    "period_lock_audit_events, period_locks, "
    "money_accounts, accounts, "
    "invoice_drafts, supplier_ledger_entries, suppliers, entity_settings, entities CASCADE"
)
_truncate_lock = threading.Lock()


@pytest.fixture
def db_session(test_engine) -> Session:
    session = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)()
    yield session
    session.rollback()
    session.close()
    with _truncate_lock, test_engine.begin() as conn:
        conn.execute(_TRUNCATE_TEST_TABLES)


@pytest.fixture
def client(db_session: Session) -> TestClient:
    def override_get_session():
        yield db_session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def restaurant_a(db_session: Session) -> Entity:
    entity = Entity(name="Restaurant A", vkn="1000000001")
    db_session.add(entity)
    db_session.commit()
    db_session.refresh(entity)
    return entity


@pytest.fixture
def restaurant_b(db_session: Session) -> Entity:
    entity = Entity(name="Restaurant B", vkn="1000000002")
    db_session.add(entity)
    db_session.commit()
    db_session.refresh(entity)
    return entity


def entity_create_json(name: str, *, vkn: str = "1234567890", legal_name: str | None = None) -> dict:
    payload: dict[str, str] = {"name": name, "vkn": vkn}
    if legal_name is not None:
        payload["legal_name"] = legal_name
    return payload
