"""Staff ledger — entity-scoped, append-only (Decisions §16)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, Enum, ForeignKey, Integer, String, Uuid, event
from sqlalchemy.orm import Mapped, mapped_column

from app.core.staff.types import StaffMovementType
from app.db.base import Base, EntityScopedMixin, utcnow


class ImmutableStaffLedgerError(RuntimeError):
    """Staff ledger entries cannot be edited or deleted."""


class StaffLedgerEntry(EntityScopedMixin, Base):
    __tablename__ = "staff_ledger_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("employees.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    movement_date: Mapped[date] = mapped_column(Date, nullable=False)
    movement_type: Mapped[StaffMovementType] = mapped_column(
        Enum(
            StaffMovementType,
            name="staff_movement_type",
            native_enum=False,
            length=32,
        ),
        nullable=False,
    )
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    try_cost_kurus: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    reference_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    period_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    period_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    extra_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


@event.listens_for(StaffLedgerEntry, "before_update")
def _staff_ledger_entry_immutable(_mapper, _connection, _target) -> None:
    raise ImmutableStaffLedgerError("staff ledger entries are immutable")


@event.listens_for(StaffLedgerEntry, "before_delete")
def _staff_ledger_entry_no_delete(_mapper, _connection, _target) -> None:
    raise ImmutableStaffLedgerError("staff ledger entries cannot be deleted")
