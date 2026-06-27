"""Learned statement line classification rules — entity-scoped, RLS."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow
from app.features.banking.statement_models import StatementLineClassification


class StatementClassificationRule(EntityScopedMixin, Base):
    __tablename__ = "statement_classification_rules"
    __table_args__ = (
        UniqueConstraint(
            "entity_id",
            "match_token",
            name="uq_statement_classification_rules_entity_token",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_token: Mapped[str] = mapped_column(String(512), nullable=False)
    classification: Mapped[StatementLineClassification] = mapped_column(
        Enum(
            StatementLineClassification,
            name="statement_line_classification",
            native_enum=False,
            length=32,
        ),
        nullable=False,
    )
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    confirmation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
