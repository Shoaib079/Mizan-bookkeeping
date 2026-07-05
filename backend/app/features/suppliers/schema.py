"""Supplier API schemas — Phase 2 supplier master."""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

_VKN_PATTERN = re.compile(r"^\d{10,11}$")


def validate_vkn(value: str) -> str:
    cleaned = value.strip()
    if not _VKN_PATTERN.match(cleaned):
        raise ValueError("VKN must be 10 or 11 digits")
    return cleaned


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=512)
    vkn: str = Field(min_length=10, max_length=11)
    iban: str | None = Field(default=None, max_length=34)
    notes: str | None = Field(default=None, max_length=2048)
    auto_post_payments: bool = False

    @field_validator("vkn")
    @classmethod
    def check_vkn(cls, value: str) -> str:
        return validate_vkn(value)


class SupplierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=512)
    iban: str | None = Field(default=None, max_length=34)
    notes: str | None = Field(default=None, max_length=2048)
    is_active: bool | None = None
    auto_post_payments: bool | None = None


class SupplierRead(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    name: str
    vkn: str
    is_active: bool
    auto_post_payments: bool
    iban: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
