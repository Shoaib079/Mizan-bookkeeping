"""What the menu document holds, with nothing else attached (slice 4).

Plain dataclasses — no ORM rows, no session, no reportlab. Everything the
page needs is read out of the database and copied in here first, and the PDF
builder is handed this and nothing else.

That seam is not tidiness. Two things sit behind it:

- **Row-level security protects a session, not an object.** A `GroupMenuLine`
  read inside `entity_context` and touched after it closes reloads, finds
  nothing, and raises `ObjectDeletedError` — an error that says nothing about
  RLS and has cost this project four debugging sessions. A PDF builder handed
  live ORM rows would hit it the first time a menu was large enough to make
  someone move the loop.
- **A document that needs a database cannot be tested.** With this in the
  middle, the layout is exercised by building a `MenuDocument` in three lines
  and reading the PDF back.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core.money import format_minor_units


@dataclass(frozen=True, slots=True)
class MenuDishLine:
    name: str
    description: str | None = None
    description_tr: str | None = None
    #: Belongs to this menu, not to the dish — "or similar", "1 litre for 4 pax".
    note: str | None = None

    def heading(self) -> str:
        return f"{self.name} ({self.note})" if self.note else self.name


@dataclass(frozen=True, slots=True)
class MenuBlock:
    name: str
    description: str | None = None
    price_minor: int | None = None
    currency: str = "USD"
    surcharge_minor: int | None = None
    surcharge_label: str | None = None
    price_excludes_vat: bool = True
    dishes: list[MenuDishLine] = field(default_factory=list)

    def price_line(self) -> str:
        """`$15.00 +KDV`, or `$27.00 + $2.00 catering charges +KDV`.

        Empty when there is no price. A menu with no price prints its dishes
        and no figure, rather than a `$0.00` nobody meant to quote.
        """
        if self.price_minor is None:
            return ""
        parts = [format_minor_units(self.price_minor, self.currency)]
        if self.surcharge_minor is not None:
            parts.append(f"+ {format_minor_units(self.surcharge_minor, self.currency)}")
            if self.surcharge_label:
                parts.append(self.surcharge_label)
        if self.price_excludes_vat:
            parts.append("+KDV")
        return " ".join(parts)


@dataclass(frozen=True, slots=True)
class MenuCategoryGroup:
    """A heading and the menus under it, in the order they should print."""

    label: str
    menus: list[MenuBlock]


@dataclass(frozen=True, slots=True)
class RestaurantIdentity:
    name: str
    address: str | None = None
    phone_primary: str | None = None
    phone_secondary: str | None = None
    email: str | None = None
    terms: str | None = None
    validity_note: str | None = None
    #: The logo bytes themselves, already read. A path would make the builder
    #: reach for storage, and storage is either a disk or R2 depending on where
    #: this is running.
    logo: bytes | None = None

    def contact_lines(self) -> list[str]:
        """The address block, skipping what has not been filled in.

        Blank lines on a document sent to an agency read as an oversight, so
        an empty field prints nothing rather than an empty row.
        """
        lines: list[str] = []
        if self.address:
            lines.extend(part.strip() for part in self.address.splitlines() if part.strip())
        phones = [p for p in (self.phone_primary, self.phone_secondary) if p]
        if phones:
            lines.append(" · ".join(phones))
        if self.email:
            lines.append(self.email)
        return lines

    def terms_lines(self) -> list[str]:
        if not self.terms:
            return []
        return [line.strip() for line in self.terms.splitlines() if line.strip()]


@dataclass(frozen=True, slots=True)
class MenuDocument:
    restaurant: RestaurantIdentity
    groups: list[MenuCategoryGroup]

    def is_empty(self) -> bool:
        return not any(group.menus for group in self.groups)
