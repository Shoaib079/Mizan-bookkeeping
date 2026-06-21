"""FX holdings subledger — entity-scoped, append-only (Decisions §15)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, Enum, ForeignKey, Integer, String, Uuid, event
from sqlalchemy.orm import Mapped, mapped_column

from app.core.fx.types import FxMovementType
from app.db.base import Base, EntityScopedMixin, utcnow


class ImmutableFxLedgerError(RuntimeError):
    """FX ledger entries cannot be edited or deleted."""


class FxLedgerEntry(EntityScopedMixin, Base):
    __tablename__ = "fx_ledger_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fx_money_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("money_accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    movement_date: Mapped[date] = mapped_column(Date, nullable=False)
    movement_type: Mapped[FxMovementType] = mapped_column(
        Enum(
            FxMovementType,
            name="fx_movement_type",
            native_enum=False,
            length=32,
        ),
        nullable=False,
    )
    native_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    try_cost_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


@event.listens_for(FxLedgerEntry, "before_update")
def _fx_ledger_entry_immutable(_mapper, _connection, _target) -> None:
    raise ImmutableFxLedgerError("fx ledger entries are immutable")


@event.listens_for(FxLedgerEntry, "before_delete")
def _fx_ledger_entry_no_delete(_mapper, _connection, _target) -> None:
    raise ImmutableFxLedgerError("fx ledger entries cannot be deleted")
