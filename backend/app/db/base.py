"""SQLAlchemy declarative base and entity-scoped mixin (Decisions §2, CURSOR_RULES §1)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, MetaData, Uuid, event
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column, validates

convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=convention)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EntityScopedMixin:
    """Every business table includes entity_id — enforced in ORM and PostgreSQL RLS."""

    @declared_attr
    def entity_id(cls) -> Mapped[uuid.UUID]:  # noqa: N805
        return mapped_column(
            Uuid(as_uuid=True),
            ForeignKey("entities.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )

    @validates("entity_id")
    def validate_entity_id(self, _key: str, value: uuid.UUID) -> uuid.UUID:
        from app.db.session import get_current_entity_id

        current = get_current_entity_id()
        if current is not None and value != current:
            raise ValueError(
                f"entity_id {value} does not match current entity context {current}"
            )
        return value


@event.listens_for(EntityScopedMixin, "before_insert", propagate=True)
@event.listens_for(EntityScopedMixin, "before_update", propagate=True)
def _stamp_entity_id_from_context(mapper, connection, target) -> None:  # noqa: ARG001
    from app.db.session import get_current_entity_id

    current = get_current_entity_id()
    if current is None:
        raise RuntimeError("Entity context required before writing scoped records")
    if getattr(target, "entity_id", None) is None:
        target.entity_id = current
    elif target.entity_id != current:
        raise RuntimeError("Cannot write scoped record for a different entity")
