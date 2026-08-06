"""Assemble the printable menu from the database (slice 4).

The one job here is to turn rows into `MenuDocument` and then let go of them.
Nothing in this module builds a PDF, and nothing downstream of it touches a
session — see `document.py` for why that line is drawn where it is.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.adapters.storage import read_upload_bytes, upload_exists
from app.core.listing import ListParams
from app.features.entities import service as entity_service
from app.features.group_sales import service as group_sales_service
from app.features.group_sales.models import MenuCategory
from app.features.menu.document import (
    MenuBlock,
    MenuCategoryGroup,
    MenuDishLine,
    MenuDocument,
    RestaurantIdentity,
)

#: Heading text and print order, matching the Word document this replaces:
#: the vegetarian menus, then Jain, then non-vegetarian, then specials, then
#: catering. Kept in step with the frontend's `MENU_CATEGORIES`.
CATEGORY_LABELS: list[tuple[MenuCategory | None, str]] = [
    (MenuCategory.VEG, "Vegetarian menus"),
    (MenuCategory.JAIN, "Jain menus"),
    (MenuCategory.NON_VEG, "Non-vegetarian menus"),
    (MenuCategory.SPECIAL, "Special menus"),
    (MenuCategory.CATERING, "Catering"),
    # Menus nobody has categorised still have to print. Silently dropping them
    # would mean a menu that exists in the app and not in the document, which
    # is the failure mode this whole feature exists to end.
    (None, "Other menus"),
]

#: Every menu, not a page of them. A restaurant with 40 menus should get 40,
#: and the default page size would quietly stop at 50 with no sign on the PDF
#: that anything was missing.
_ALL_MENUS = ListParams(limit=500, offset=0)


def _logo_bytes(entity) -> bytes | None:
    """Read the logo, or print without one.

    A missing file is not worth failing the whole document over: the menu is
    still correct without the logo, and refusing to generate it would leave
    someone unable to send prices because of an image.
    """
    stored = entity.logo_stored_path
    if not stored or not upload_exists(stored):
        return None
    try:
        return read_upload_bytes(stored)
    except (OSError, ValueError):
        return None


def build_menu_document(session: Session, entity_id: uuid.UUID) -> MenuDocument:
    entity = entity_service.get_entity(session, entity_id)
    if entity is None:
        raise LookupError("Entity not found")

    restaurant = RestaurantIdentity(
        name=entity.name,
        address=entity.address,
        phone_primary=entity.phone_primary,
        phone_secondary=entity.phone_secondary,
        email=entity.email,
        terms=entity.menu_terms,
        validity_note=entity.menu_validity_note,
        logo=_logo_bytes(entity),
    )

    # Active menus only. A retired menu is one whose prices are no longer being
    # offered, and the entire point of sending a PDF is that the figures on it
    # are the ones you stand behind.
    menus, _total = group_sales_service.list_group_menus(
        session, entity_id, include_inactive=False, list_params=_ALL_MENUS
    )

    by_category: dict[MenuCategory | None, list[MenuBlock]] = {}
    for menu in menus:
        block = MenuBlock(
            name=menu.name,
            description=menu.description,
            price_minor=menu.price_minor,
            currency=menu.currency,
            surcharge_minor=menu.surcharge_minor,
            surcharge_label=menu.surcharge_label,
            price_excludes_vat=menu.price_excludes_vat,
            dishes=[
                MenuDishLine(
                    name=line.dish.name,
                    description=line.dish.description,
                    description_tr=line.dish.description_tr,
                    note=line.note,
                )
                # The menu's own order, not the database's. `sort_order` is what
                # puts rice, naan and dessert last.
                for line in sorted(menu.lines, key=lambda row: (row.sort_order, row.id))
            ],
        )
        by_category.setdefault(menu.category, []).append(block)

    groups = [
        MenuCategoryGroup(label=label, menus=by_category[category])
        for category, label in CATEGORY_LABELS
        if by_category.get(category)
    ]
    return MenuDocument(restaurant=restaurant, groups=groups)
