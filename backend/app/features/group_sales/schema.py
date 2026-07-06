"""Group sales API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.core.schema_types import OptionalActorId

SUPPORTED_FOREX = frozenset({"USD", "EUR", "GBP"})
GROUP_SALE_REFERENCE = "group_sale"


class GroupMenuCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class GroupMenuUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    is_active: bool | None = None


class GroupMenuRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    is_active: bool
    created_at: datetime


class GroupSaleLineInput(BaseModel):
    group_menu_id: uuid.UUID | None = None
    menu_name: str | None = Field(default=None, max_length=255)
    pax: int = Field(gt=0)
    rate_per_person_minor: int = Field(gt=0)


class GroupSaleCreate(BaseModel):
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
        if self.fx_rate_used is None and self.total_kurus is None:
            raise ValueError("FX booking requires fx_rate_used or total_kurus")
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


class GroupSalePostResponse(BaseModel):
    group_sale: GroupSaleRead
    balance_kurus: int
    balance_forex_minor: int | None = None
    balance_forex_currency: str | None = None
