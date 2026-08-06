"""Menu API schemas (MENU_PLAN.md §3)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _clean(value: str | None) -> str | None:
    """Trim, and treat an empty string as absent.

    A form posts "" for a field the user left alone, and storing that makes an
    empty description indistinguishable from a missing one — which then prints
    as a blank line under the dish.
    """
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


class DishCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    # Default true: a new dish is offered on every menu until told otherwise,
    # so rice, naan, salad and water need no ticking at all.
    suits_veg: bool = True
    suits_non_veg: bool = True
    suits_jain: bool = True

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("name is required")
        return trimmed

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        return _clean(value)


class DishUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    suits_veg: bool | None = None
    suits_non_veg: bool | None = None
    suits_jain: bool | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("name cannot be blank")
        return trimmed


class DishRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    suits_veg: bool
    suits_non_veg: bool
    suits_jain: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
