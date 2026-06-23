"""Period lock models — soft day/month closes (Phase 8.5 Slice 4)."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, Enum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow


class PeriodLockKind(str, enum.Enum):
    DAY = "day"
    MONTH = "month"


class PeriodLockAuditAction(str, enum.Enum):
    CLOSE = "close"
    REOPEN = "reopen"
    UNLOCK_WRITE = "unlock_write"


class PeriodLock(EntityScopedMixin, Base):
    __tablename__ = "period_locks"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lock_kind: Mapped[PeriodLockKind] = mapped_column(
        Enum(PeriodLockKind, name="period_lock_kind", native_enum=False, length=8),
        nullable=False,
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    closed_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
    closed_by: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    reopened_at: Mapped[datetime | None] = mapped_column(nullable=True)
    reopened_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    dirty: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class PeriodLockAuditEvent(EntityScopedMixin, Base):
    __tablename__ = "period_lock_audit_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    period_lock_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("period_locks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[PeriodLockAuditAction] = mapped_column(
        Enum(PeriodLockAuditAction, name="period_lock_audit_action", native_enum=False, length=16),
        nullable=False,
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    detail: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
