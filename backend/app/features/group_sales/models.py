"""Group / agency sales — menus, itemized bookings, FX/TRY receivables."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, Enum, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, EntityScopedMixin, utcnow

if TYPE_CHECKING:  # pragma: no cover - typing only
    from app.features.menu.models import Dish


class GroupSaleStatus(str, enum.Enum):
    POSTED = "posted"
    VOIDED = "voided"
    AMENDED = "amended"


class MenuCategory(str, enum.Enum):
    """How the printed document groups its menus.

    Taken from the existing Word file, which orders them exactly this way:
    the vegetarian menus, then Jain, then non-vegetarian, then the specials,
    then catering.
    """

    VEG = "veg"
    JAIN = "jain"
    NON_VEG = "non_veg"
    SPECIAL = "special"
    CATERING = "catering"


class GroupMenu(EntityScopedMixin, Base):
    __tablename__ = "group_menus"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    #: Optional blurb under the menu name on the printed document.
    description: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    #: The list price per person. Nullable because menus existed before prices
    #: did — an unpriced menu is legitimate until someone fills it in.
    price_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    #: The catering menus carry "+$2 catering charges"; the rest carry nothing.
    #: Kept separate from the price because it is quoted separately.
    surcharge_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    surcharge_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    #: Renders the "+KDV" note. Every current menu excludes VAT.
    price_excludes_vat: Mapped[bool] = mapped_column(default=True)
    category: Mapped[MenuCategory | None] = mapped_column(
        Enum(MenuCategory, name="menu_category", native_enum=False, length=16),
        nullable=True,
    )
    #: The order on the printed document. Alphabetical would put Catering
    #: first and Veg Menu 1 in the middle.
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    lines: Mapped[list["GroupMenuLine"]] = relationship(
        back_populates="menu",
        cascade="all, delete-orphan",
        order_by="GroupMenuLine.sort_order",
    )


class GroupMenuLine(EntityScopedMixin, Base):
    """One dish on one menu, in order.

    The dish is a reference, not a copy: correcting "Desert" to "Dessert" on
    the dish fixes every menu at once, which is the whole reason this table
    exists instead of a text column.
    """

    __tablename__ = "group_menu_lines"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_menu_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("group_menus.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dish_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("dishes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    #: Rice, naan and dessert belong at the end, and that is a decision per
    #: menu rather than a property of the dish.
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: "or similar", "1 litre for 4 pax". The current document says "OR
    #: SIMILAR" on a dozen lines; without this the qualifier would have to go
    #: into the dish name, where it would be wrong on every other menu.
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    menu: Mapped[GroupMenu] = relationship(back_populates="lines")
    #: The dish this line points at. Always eager-loaded by the service:
    #: a lazy load would fire after `entity_context` closes, where row-level
    #: security hides the row and the name would silently come back missing.
    dish: Mapped["Dish"] = relationship(lazy="raise")


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
