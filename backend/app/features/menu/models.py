"""Menu persistence — entity-scoped, RLS (MENU_PLAN.md §3).

A dish is written once per restaurant and referenced by however many menus
serve it. In the Word document that preceded this, Dal Tadka, White Rice,
Tandoori Naan, Water and Fresh Salad were typed separately into eleven menus,
which is how "DESERT" survived three years and how the Jain menu came to list
White Rice twice.

Per restaurant, deliberately: the locations are separate companies with
separate VKNs, so a dish carries an ``entity_id`` like every other business
record and one restaurant can never read or alter another's menu.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Enum, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow


class DietaryKind(str, enum.Enum):
    """What a dish is suitable for.

    Optional — the existing menus classify at the menu level, not per dish.
    Useful when building a menu: it is what catches a meat dish landing on the
    Jain menu.
    """

    VEG = "veg"
    NON_VEG = "non_veg"
    JAIN = "jain"


class Dish(EntityScopedMixin, Base):
    __tablename__ = "dishes"
    __table_args__ = (
        # Two dishes with the same name are a data-entry slip, not a menu
        # decision — and the whole point of a shared list is that "Dal Tadka"
        # means one thing.
        UniqueConstraint("entity_id", "name", name="uq_dishes_entity_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    #: The detail the current menus lack entirely. Optional: a dish with none
    #: prints as its name alone, exactly as the Word file does today.
    description: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    dietary: Mapped[DietaryKind | None] = mapped_column(
        Enum(
            DietaryKind,
            name="dietary_kind",
            native_enum=False,
            length=16,
        ),
        nullable=True,
    )
    #: Retired rather than deleted, so a menu that still lists it keeps reading
    #: correctly and last year's document can still be explained.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
