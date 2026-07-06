"""Customer receivables ledger — entity-scoped, append-only (Decisions §10)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, Enum, ForeignKey, Integer, String, Uuid, event
from sqlalchemy.orm import Mapped, mapped_column

from app.core.receivables.types import CustomerMovementType
from app.db.base import Base, EntityScopedMixin, utcnow


class ImmutableReceivablesLedgerError(RuntimeError):
    """Receivables ledger entries cannot be edited or deleted."""


class CustomerLedgerEntry(EntityScopedMixin, Base):
    __tablename__ = "customer_ledger_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    movement_date: Mapped[date] = mapped_column(Date, nullable=False)
    movement_type: Mapped[CustomerMovementType] = mapped_column(
        Enum(
            CustomerMovementType,
            name="customer_movement_type",
            native_enum=False,
            length=32,
        ),
        nullable=False,
    )
    amount_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    pax: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rate_per_person_kurus: Mapped[int | None] = mapped_column(Integer, nullable=True)
    forex_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    rate_per_person_forex_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_forex_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payment_native_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
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


@event.listens_for(CustomerLedgerEntry, "before_update")
def _customer_ledger_entry_immutable(_mapper, _connection, _target) -> None:
    raise ImmutableReceivablesLedgerError("customer ledger entries are immutable")


@event.listens_for(CustomerLedgerEntry, "before_delete")
def _customer_ledger_entry_no_delete(_mapper, _connection, _target) -> None:
    raise ImmutableReceivablesLedgerError("customer ledger entries cannot be deleted")
