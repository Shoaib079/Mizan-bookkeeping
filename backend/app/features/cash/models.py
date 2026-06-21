"""Cash drawer persistence — sessions and movements (Decisions §14)."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, Enum, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow


class CashDrawerSessionStatus(str, enum.Enum):
    OPEN = "open"
    CLOSED = "closed"


class CashMovementDirection(str, enum.Enum):
    IN = "in"
    OUT = "out"


class CashDrawerSession(EntityScopedMixin, Base):
    __tablename__ = "cash_drawer_sessions"
    __table_args__ = (
        UniqueConstraint(
            "entity_id",
            "money_account_id",
            "session_date",
            name="uq_cash_drawer_sessions_entity_account_date",
        ),
        UniqueConstraint(
            "close_journal_entry_id",
            name="uq_cash_drawer_sessions_close_journal_entry_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    money_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("money_accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[CashDrawerSessionStatus] = mapped_column(
        Enum(
            CashDrawerSessionStatus,
            name="cash_drawer_session_status",
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=CashDrawerSessionStatus.OPEN,
    )
    expected_balance_kurus: Mapped[int | None] = mapped_column(Integer, nullable=True)
    counted_balance_kurus: Mapped[int | None] = mapped_column(Integer, nullable=True)
    over_short_kurus: Mapped[int | None] = mapped_column(Integer, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    closed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    close_journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class CashMovement(EntityScopedMixin, Base):
    __tablename__ = "cash_movements"
    __table_args__ = (
        UniqueConstraint("journal_entry_id", name="uq_cash_movements_journal_entry_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("cash_drawer_sessions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    money_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("money_accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    movement_date: Mapped[date] = mapped_column(Date, nullable=False)
    direction: Mapped[CashMovementDirection] = mapped_column(
        Enum(
            CashMovementDirection,
            name="cash_movement_direction",
            native_enum=False,
            length=8,
        ),
        nullable=False,
    )
    amount_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    offset_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
