"""Database engine, sessions, and mandatory entity context (CURSOR_RULES §1 #5)."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

_current_entity_id: ContextVar[uuid.UUID | None] = ContextVar("current_entity_id", default=None)


def get_current_entity_id() -> uuid.UUID | None:
    return _current_entity_id.get()


def create_db_engine(url: str | None = None) -> Engine:
    return create_engine(url or settings.database_url, pool_pre_ping=True)


engine = create_db_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def entity_context(session: Session, entity_id: uuid.UUID):
    """Set PostgreSQL RLS variable (connection-scoped) and Python context."""
    token = _current_entity_id.set(entity_id)
    session.execute(
        text("SELECT set_config('app.current_entity_id', :entity_id, false)"),
        {"entity_id": str(entity_id)},
    )
    try:
        yield session
    finally:
        _current_entity_id.reset(token)
        try:
            session.execute(text("SELECT set_config('app.current_entity_id', '', false)"))
        except Exception:
            session.rollback()
            session.execute(text("SELECT set_config('app.current_entity_id', '', false)"))


@contextmanager
def posting_account_lookup(session: Session):
    """Allow cross-entity account reads inside the posting boundary for validation only."""
    session.execute(text("SELECT set_config('app.posting_lookup', '1', true)"))
    try:
        yield session
    finally:
        session.execute(text("SELECT set_config('app.posting_lookup', '', true)"))


def require_entity_context() -> uuid.UUID:
    entity_id = get_current_entity_id()
    if entity_id is None:
        raise RuntimeError("Entity context is not set")
    return entity_id
