"""Supplier payables ledger — entity-scoped, append-only (Decisions §8)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, Enum, ForeignKey, Integer, String, Uuid, event
from sqlalchemy.orm import Mapped, mapped_column

from app.core.payables.types import SupplierMovementType
from app.db.base import Base, EntityScopedMixin, utcnow


class ImmutablePayablesLedgerError(RuntimeError):
    """Payables ledger entries cannot be edited or deleted."""


class SupplierLedgerEntry(EntityScopedMixin, Base):
    __tablename__ = "supplier_ledger_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    movement_date: Mapped[date] = mapped_column(Date, nullable=False)
    movement_type: Mapped[SupplierMovementType] = mapped_column(
        Enum(
            SupplierMovementType,
            name="supplier_movement_type",
            native_enum=False,
            length=32,
        ),
        nullable=False,
    )
    amount_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
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
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


@event.listens_for(SupplierLedgerEntry, "before_update")
def _supplier_ledger_entry_immutable(_mapper, _connection, _target) -> None:
    raise ImmutablePayablesLedgerError("supplier ledger entries are immutable")


@event.listens_for(SupplierLedgerEntry, "before_delete")
def _supplier_ledger_entry_no_delete(_mapper, _connection, _target) -> None:
    raise ImmutablePayablesLedgerError("supplier ledger entries cannot be deleted")
