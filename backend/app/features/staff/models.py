"""Employee master persistence — entity-scoped, RLS (Decisions §16)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Enum, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.staff.types import PayCurrency
from app.db.base import Base, EntityScopedMixin, utcnow


class Employee(EntityScopedMixin, Base):
    __tablename__ = "employees"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    pay_currency: Mapped[PayCurrency] = mapped_column(
        Enum(
            PayCurrency,
            name="pay_currency",
            native_enum=False,
            length=3,
        ),
        nullable=False,
        default=PayCurrency.TRY,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
