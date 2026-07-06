"""Group / agency sales — menus, itemized bookings, FX/TRY receivables."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, EntityScopedMixin, utcnow


class GroupSaleStatus(str, enum.Enum):
    POSTED = "posted"
    VOIDED = "voided"
    AMENDED = "amended"


class GroupMenu(EntityScopedMixin, Base):
    __tablename__ = "group_menus"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class GroupSale(EntityScopedMixin, Base):
    __tablename__ = "group_sales"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    sale_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=GroupSaleStatus.POSTED.value)
    total_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    forex_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    total_forex_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fx_rate_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    customer_ledger_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customer_ledger_entries.id", ondelete="RESTRICT"),
        nullable=True,
    )
    amends_group_sale_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("group_sales.id", ondelete="RESTRICT"),
        nullable=True,
    )
    amended_by_group_sale_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("group_sales.id", ondelete="RESTRICT"),
        nullable=True,
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    lines: Mapped[list["GroupSaleLine"]] = relationship(
        back_populates="group_sale",
        cascade="all, delete-orphan",
    )


class GroupSaleLine(EntityScopedMixin, Base):
    __tablename__ = "group_sale_lines"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_sale_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("group_sales.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    group_menu_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("group_menus.id", ondelete="SET NULL"),
        nullable=True,
    )
    menu_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    pax: Mapped[int] = mapped_column(Integer, nullable=False)
    rate_per_person_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total_kurus: Mapped[int] = mapped_column(Integer, nullable=False)

    group_sale: Mapped[GroupSale] = relationship(back_populates="lines")
