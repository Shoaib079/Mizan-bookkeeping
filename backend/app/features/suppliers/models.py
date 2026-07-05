"""Supplier master persistence — entity-scoped, RLS (Decisions §8)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow


class Supplier(EntityScopedMixin, Base):
    __tablename__ = "suppliers"
    __table_args__ = (
        UniqueConstraint("entity_id", "vkn", name="uq_suppliers_entity_vkn"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    vkn: Mapped[str] = mapped_column(String(11), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    auto_post_payments: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    iban: Mapped[str | None] = mapped_column(String(34), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
