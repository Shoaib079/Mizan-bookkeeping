"""Pytest fixtures — PostgreSQL test database with RLS (entity isolation tests)."""

from __future__ import annotations

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
    engine = create_engine(settings.test_database_url, pool_pre_ping=True)
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
    entity = Entity(name="Restaurant A")
    db_session.add(entity)
    db_session.commit()
    db_session.refresh(entity)
    return entity


@pytest.fixture
def restaurant_b(db_session: Session) -> Entity:
    entity = Entity(name="Restaurant B")
    db_session.add(entity)
    db_session.commit()
    db_session.refresh(entity)
    return entity
