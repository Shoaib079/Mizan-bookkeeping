"""Restaurant / legal entity registry — not entity-scoped (Decisions §2)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, EntityScopedMixin, utcnow


class Entity(Base):
    __tablename__ = "entities"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    vkn: Mapped[str | None] = mapped_column(String(11), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    settings: Mapped[list["EntitySetting"]] = relationship(back_populates="entity")


class EntitySetting(EntityScopedMixin, Base):
    """Per-entity configuration — RLS-enforced (Decisions §2 feature toggles)."""

    __tablename__ = "entity_settings"
    __table_args__ = (UniqueConstraint("entity_id", "key", name="uq_entity_settings_entity_key"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    value: Mapped[str] = mapped_column(String(1024), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    entity: Mapped["Entity"] = relationship(back_populates="settings")
