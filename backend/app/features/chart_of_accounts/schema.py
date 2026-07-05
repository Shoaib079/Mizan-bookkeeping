"""Chart of accounts API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType


class CreateExpenseCategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)

    model_config = {"extra": "forbid"}


class AccountRead(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    code: str
    name_en: str
    name_tr: str
    account_type: AccountType
    normal_balance: AccountNormalBalance
    accepts_opening_balance: bool
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SeedChartResponse(BaseModel):
    entity_id: uuid.UUID
    accounts_created: int
    accounts: list[AccountRead]
