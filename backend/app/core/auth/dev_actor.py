"""Ensure the local-dev placeholder actor exists (AUTH_ENFORCEMENT=false)."""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.schema_types import DEV_ACTOR_ID
from app.db.session import SessionLocal
from app.features.auth.models import User

_DEV_EMAIL = "dev-actor@localhost"
_DEV_NAME = "Local Dev Actor"


def ensure_dev_actor_user(session: Session | None = None) -> None:
    """Insert ``DEV_ACTOR_ID`` into ``users`` if missing.

    Cash drawer close (and other audited writes) FK to ``users.id``. With auth
    off, ``resolve_actor_id`` falls back to ``DEV_ACTOR_ID`` — that row must exist
    in restored/live local DBs that never ran the test suite seed.
    """
    owns_session = session is None
    db = session or SessionLocal()
    try:
        if db.get(User, DEV_ACTOR_ID) is not None:
            return
        db.add(
            User(
                id=DEV_ACTOR_ID,
                email=_DEV_EMAIL,
                display_name=_DEV_NAME,
                is_active=True,
            )
        )
        db.commit()
    except IntegrityError:
        db.rollback()
    finally:
        if owns_session:
            db.close()
