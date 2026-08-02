"""Local-dev actor row — required for audited writes when auth is off."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import select

from app.config import settings
from app.core.auth.dev_actor import ensure_dev_actor_user
from app.core.cash.guards import _is_owner
from app.core.schema_types import DEV_ACTOR_ID
from app.features.auth.models import User


def test_main_does_not_ensure_dev_actor_at_import() -> None:
    """Importing app.main must not touch Postgres (CI provisions roles later)."""
    main_src = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text()
    assert "from app.core.auth.dev_actor import" not in main_src
    assert "ensure_dev_actor_user(" not in main_src


def test_ensure_dev_actor_user_is_idempotent(db_session) -> None:
    ensure_dev_actor_user(db_session)
    ensure_dev_actor_user(db_session)
    user = db_session.get(User, DEV_ACTOR_ID)
    assert user is not None
    assert user.email == "dev-actor@localhost"
    count = len(
        db_session.scalars(select(User).where(User.id == DEV_ACTOR_ID)).all()
    )
    assert count == 1


def test_dev_actor_counts_as_owner_when_auth_off(db_session, restaurant_a) -> None:
    """Local bypass has no memberships; unlock must still work for DEV_ACTOR."""
    assert settings.auth_enforcement is False
    ensure_dev_actor_user(db_session)
    assert _is_owner(db_session, restaurant_a.id, DEV_ACTOR_ID) is True
