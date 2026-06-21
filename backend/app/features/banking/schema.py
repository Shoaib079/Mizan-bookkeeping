"""Money account API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.features.banking.models import MoneyAccountKind


class MoneyAccountCreate(BaseModel):
    account_kind: MoneyAccountKind
    name: str = Field(min_length=1, max_length=255)
    bank_name: str | None = Field(default=None, max_length=255)
    iban: str | None = Field(default=None, max_length=34)
    last_four: str | None = Field(default=None, min_length=4, max_length=4)


class MoneyAccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    bank_name: str | None = Field(default=None, max_length=255)
    iban: str | None = Field(default=None, max_length=34)
    last_four: str | None = Field(default=None, min_length=4, max_length=4)
    is_active: bool | None = None


class MoneyAccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    account_kind: MoneyAccountKind
    name: str
    gl_account_id: uuid.UUID
    gl_account_code: str
    bank_name: str | None
    iban: str | None
    last_four: str | None
    is_active: bool
    balance_kurus: int
    created_at: datetime
    updated_at: datetime


class MoneyAccountTreeLeaf(BaseModel):
    id: uuid.UUID
    name: str
    account_kind: MoneyAccountKind
    gl_account_id: uuid.UUID
    gl_account_code: str
    bank_name: str | None
    iban: str | None
    last_four: str | None
    is_active: bool
    balance_kurus: int


class MoneyAccountTreeBranch(BaseModel):
    bucket_code: str
    bucket_name_en: str
    bucket_name_tr: str
    bucket_gl_account_id: uuid.UUID
    balance_kurus: int
    accounts: list[MoneyAccountTreeLeaf]


class MoneyAccountTree(BaseModel):
    banks: MoneyAccountTreeBranch
    cash: MoneyAccountTreeBranch
