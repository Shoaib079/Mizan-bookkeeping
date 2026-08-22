"""Group sales API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.core.schema_types import OptionalActorId, AcknowledgeDuplicateMixin
from app.features.group_sales.models import MenuCategory

SUPPORTED_FOREX = frozenset({"USD", "EUR", "GBP"})
GROUP_SALE_REFERENCE = "group_sale"


class GroupMenuCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    price_minor: int | None = Field(default=None, ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    surcharge_minor: int | None = Field(default=None, ge=0)
    surcharge_label: str | None = Field(default=None, max_length=255)
    price_excludes_vat: bool = True
    category: MenuCategory | None = None
    sort_order: int = 0


class GroupMenuUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    price_minor: int | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    surcharge_minor: int | None = Field(default=None, ge=0)
    surcharge_label: str | None = Field(default=None, max_length=255)
    price_excludes_vat: bool | None = None
    category: MenuCategory | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class GroupMenuLineInput(BaseModel):
    """One dish on a menu. Order comes from the position in the list."""

    dish_id: uuid.UUID
    note: str | None = Field(default=None, max_length=255)


class GroupMenuLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    dish_id: uuid.UUID
    dish_name: str
    dish_description: str | None
    dish_description_tr: str | None
    sort_order: int
    note: str | None


class GroupMenuRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    price_minor: int | None
    currency: str
    surcharge_minor: int | None
    surcharge_label: str | None
    price_excludes_vat: bool
    category: MenuCategory | None
    sort_order: int
    is_active: bool
    created_at: datetime
    #: Filled on the detail read; the list leaves it empty and sends a count.
    lines: list[GroupMenuLineRead] = []
    line_count: int = 0


class GroupSaleLineInput(BaseModel):
    """A menu line, priced either per head or as an agreed total.

    Exactly one of `rate_per_person_minor` or `line_total_minor` is given.
    Sending the total keeps it exact: 94,00 for 6 pax posts 94,00, not the
    94,02 you would get from storing a rounded 15,67 rate and multiplying.
    The rate is then a derived, displayed figure.
    """

    group_menu_id: uuid.UUID | None = None
    menu_name: str | None = Field(default=None, max_length=255)
    pax: int = Field(gt=0)
    rate_per_person_minor: int | None = Field(default=None, gt=0)
    line_total_minor: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def exactly_one_price(self) -> "GroupSaleLineInput":
        has_rate = self.rate_per_person_minor is not None
        has_total = self.line_total_minor is not None
        if has_rate == has_total:
            raise ValueError(
                "give either rate_per_person_minor or line_total_minor, not both"
            )
        return self


class GroupSaleCreate(AcknowledgeDuplicateMixin):
    customer_id: uuid.UUID
    sale_date: date
    description: str = Field(min_length=1, max_length=512)
    currency: str = Field(min_length=3, max_length=3)
    lines: list[GroupSaleLineInput] = Field(min_length=1)
    actor_id: OptionalActorId = None
    fx_rate_used: int | None = Field(
        default=None,
        gt=0,
        description="TRY kuruş per 1 major unit of forex (e.g. 3500 = ₺35.00 per USD)",
    )
    total_kurus: int | None = Field(
        default=None,
        gt=0,
        description="Optional explicit TRY total for FX bookings",
    )

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        code = value.strip().upper()
        if code != "TRY" and code not in SUPPORTED_FOREX:
            raise ValueError("currency must be TRY, USD, EUR, or GBP")
        return code

    @model_validator(mode="after")
    def check_fx_rate(self) -> GroupSaleCreate:
        if self.currency == "TRY":
            if self.fx_rate_used is not None:
                raise ValueError("fx_rate_used is only for forex bookings")
            if self.total_kurus is not None:
                raise ValueError("total_kurus override is only for forex bookings")
            return self
        # Forex bookings may omit fx_rate_used and total_kurus (GS-FX rateless path).
        return self


class GroupSaleLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_menu_id: uuid.UUID | None
    menu_name_snapshot: str
    pax: int
    rate_per_person_minor: int
    line_total_minor: int
    line_total_kurus: int


class GroupSaleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    sale_date: date
    description: str
    currency: str
    status: str
    total_kurus: int
    forex_currency: str | None
    total_forex_minor: int | None
    fx_rate_used: int | None
    journal_entry_id: uuid.UUID | None
    customer_ledger_entry_id: uuid.UUID | None
    amends_group_sale_id: uuid.UUID | None
    amended_by_group_sale_id: uuid.UUID | None
    actor_id: OptionalActorId = None
    created_at: datetime
    lines: list[GroupSaleLineRead] = Field(default_factory=list)
    remaining_kurus: int | None = None
    remaining_forex_minor: int | None = None


class GroupSaleCorrect(GroupSaleCreate):
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class GroupSaleVoid(BaseModel):
    actor_id: OptionalActorId = None
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class GroupSaleDiscountCreate(BaseModel):
    actor_id: OptionalActorId = None
    discount_kurus: int = Field(gt=0)
    discount_native: int | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=512)
    discount_date: date | None = None


class GroupSalePostResponse(BaseModel):
    group_sale: GroupSaleRead
    balance_kurus: int
    balance_forex_minor: int | None = None
    balance_forex_currency: str | None = None
