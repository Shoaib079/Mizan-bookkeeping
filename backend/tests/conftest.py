"""Pytest fixtures — PostgreSQL test database with RLS (entity isolation tests)."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db.base import Base
from app.db.bootstrap import ensure_test_database, init_database
from app.db.session import get_session
from app.features.entities.models import Entity, EntitySetting
from app.main import app


@pytest.fixture(scope="session")
def test_engine():
    ensure_test_database()
    engine = create_engine(settings.test_database_url, pool_pre_ping=True)
    Base.metadata.drop_all(engine)
    init_database(settings.test_database_url)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def db_session(test_engine) -> Session:
    session = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)()
    yield session
    session.rollback()
    session.execute(
        text(
            "TRUNCATE ledger_audit_events, journal_entry_lines, journal_entries, money_accounts, accounts, "
            "invoice_drafts, supplier_ledger_entries, suppliers, entity_settings, entities CASCADE"
        )
    )
    session.commit()
    session.close()


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
