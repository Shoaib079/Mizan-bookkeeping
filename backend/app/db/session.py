"""Database engine, sessions, and mandatory entity context (CURSOR_RULES §1 #5)."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

_current_entity_id: ContextVar[uuid.UUID | None] = ContextVar("current_entity_id", default=None)


def get_current_entity_id() -> uuid.UUID | None:
    return _current_entity_id.get()


def create_db_engine(url: str | None = None) -> Engine:
    if url is None:
        url = settings.test_database_url if settings.app_env == "test" else settings.database_url
    return create_engine(url, pool_pre_ping=True)


engine = create_db_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _entity_guc_value(entity_id: uuid.UUID | None) -> str:
    return str(entity_id) if entity_id else ""


def _apply_entity_guc(session: Session, entity_id: uuid.UUID | None) -> None:
    """Set PostgreSQL RLS variable for the current transaction."""
    session.execute(
        text("SELECT set_config('app.current_entity_id', :entity_id, true)"),
        {"entity_id": _entity_guc_value(entity_id)},
    )


@event.listens_for(Session, "after_begin")
def _sync_entity_guc_after_begin(session, transaction, connection) -> None:  # noqa: ARG001
    """Re-apply entity GUC after commit — transaction-local settings do not survive."""
    connection.execute(
        text("SELECT set_config('app.current_entity_id', :entity_id, true)"),
        {"entity_id": _entity_guc_value(get_current_entity_id())},
    )


@contextmanager
def entity_context(session: Session, entity_id: uuid.UUID):
    """Set PostgreSQL RLS variable (transaction-scoped) and Python context."""
    token = _current_entity_id.set(entity_id)
    _apply_entity_guc(session, entity_id)
    try:
        yield session
    finally:
        _current_entity_id.reset(token)
        try:
            _apply_entity_guc(session, None)
        except Exception:
            session.rollback()
            _apply_entity_guc(session, None)


@contextmanager
def posting_account_lookup(session: Session):
    """Allow cross-entity account reads inside the posting boundary for validation only."""
    session.execute(text("SELECT set_config('app.posting_lookup', '1', true)"))
    try:
        yield session
    finally:
        session.execute(text("SELECT set_config('app.posting_lookup', '', true)"))


@contextmanager
def user_membership_lookup(session: Session, user_id: uuid.UUID):
    """Allow reading entity_memberships rows for a user across entities (entity list)."""
    session.execute(
        text("SELECT set_config('app.current_user_id', :user_id, true)"),
        {"user_id": str(user_id)},
    )
    try:
        yield session
    finally:
        session.execute(text("SELECT set_config('app.current_user_id', '', true)"))


def require_entity_context() -> uuid.UUID:
    entity_id = get_current_entity_id()
    if entity_id is None:
        raise RuntimeError("Entity context is not set")
    return entity_id
