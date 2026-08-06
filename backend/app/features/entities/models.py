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

    # Branding, for documents this restaurant sends out (MENU_PLAN.md slice 3).
    #
    # These live on the restaurant row rather than on the menu deliberately.
    # The Word menus this replaces carried the address and phone numbers typed
    # into each document, which is how one location's menu went out carrying
    # another location's address for three years. Printed from the same row as
    # the name, the two cannot disagree.
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    phone_primary: Mapped[str | None] = mapped_column(String(64), nullable=True)
    phone_secondary: Mapped[str | None] = mapped_column(String(64), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    menu_terms: Mapped[str | None] = mapped_column(String(4096), nullable=True)
    menu_validity_note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # The logo is stored like every other upload — a path handed back by the
    # storage facade, local disk or R2 depending on deployment. It is never
    # sent to the browser; the browser asks for `/entities/{id}/logo` and the
    # server reads it, so an R2 key is not a public URL.
    logo_stored_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    logo_media_type: Mapped[str | None] = mapped_column(String(64), nullable=True)

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
