"""Audit trail for owner corrections that feed document learning."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, Uuid
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.core.learning.types import LearningDomain
from app.db.base import Base, EntityScopedMixin, utcnow


class LearningCorrectionEvent(EntityScopedMixin, Base):
    __tablename__ = "learning_correction_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    domain: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    source_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    match_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    field_name: Mapped[str] = mapped_column(String(64), nullable=False)
    before_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    after_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


def record_learning_correction(
    session: Session,
    *,
    domain: LearningDomain,
    field_name: str,
    before_value: str | None,
    after_value: str | None,
    match_token: str | None = None,
    source_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
) -> None:
    """Persist what changed when the owner corrected a learned suggestion."""
    if before_value == after_value:
        return

    session.add(
        LearningCorrectionEvent(
            domain=domain.value,
            source_id=source_id,
            match_token=match_token,
            field_name=field_name,
            before_value=before_value,
            after_value=after_value,
            actor_id=actor_id,
        )
    )
    session.flush()
