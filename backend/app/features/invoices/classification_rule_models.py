"""Learned e-Fatura invoice kind rules — entity-scoped, RLS."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow


class InvoiceClassificationRule(EntityScopedMixin, Base):
    __tablename__ = "invoice_classification_rules"
    __table_args__ = (
        UniqueConstraint(
            "entity_id",
            "seller_vkn",
            "match_token",
            name="uq_invoice_classification_rules_entity_vkn_token",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_token: Mapped[str] = mapped_column(String(512), nullable=False)
    seller_vkn: Mapped[str] = mapped_column(
        String(16), nullable=False, default="", server_default="", index=True
    )
    invoice_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    delivery_platform_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("delivery_platforms.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    confirmation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    correction_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    confirmations_since_correction: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
