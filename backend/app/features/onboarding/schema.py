"""Onboarding wizard schemas — opening balances plan (Decisions §19)."""

from __future__ import annotations

import uuid
from datetime import date
from enum import Enum

from pydantic import BaseModel, Field, model_validator

from app.core.chart_of_accounts.types import AccountNormalBalance


class OnboardingStep(str, Enum):
    ENTITY_CREATED = "entity_created"
    SEED_CHART = "seed_chart"
    DELIVERY_SETTINGS = "delivery_settings"
    BANK_ACCOUNTS = "bank_accounts"
    OPENING_BALANCES = "opening_balances"
    REVIEW_TRIAL_BALANCE = "review_trial_balance"
    POST_DAY_ONE = "post_day_one"


ONBOARDING_WIZARD_STEPS: tuple[OnboardingStep, ...] = (
    OnboardingStep.ENTITY_CREATED,
    OnboardingStep.SEED_CHART,
    OnboardingStep.DELIVERY_SETTINGS,
    OnboardingStep.BANK_ACCOUNTS,
    OnboardingStep.OPENING_BALANCES,
    OnboardingStep.REVIEW_TRIAL_BALANCE,
    OnboardingStep.POST_DAY_ONE,
)


class OpeningBalanceLineIn(BaseModel):
    amount_kurus: int = Field(gt=0)
    account_code: str | None = Field(default=None, min_length=1, max_length=16)
    money_account_id: uuid.UUID | None = None
    supplier_id: uuid.UUID | None = None
    side: AccountNormalBalance | None = None

    @model_validator(mode="after")
    def validate_single_target(self) -> OpeningBalanceLineIn:
        targets = [self.account_code, self.money_account_id, self.supplier_id]
        set_count = sum(1 for target in targets if target is not None)
        if set_count != 1:
            raise ValueError(
                "each line must specify exactly one of account_code, "
                "money_account_id, or supplier_id"
            )
        if self.account_code is not None and self.side is None:
            raise ValueError("side is required for account_code lines")
        if self.account_code is None and self.side is not None:
            raise ValueError(
                "side is implied for money_account_id and supplier_id lines"
            )
        return self


class OpeningBalanceValidateRequest(BaseModel):
    lines: list[OpeningBalanceLineIn] = Field(min_length=1)


class JournalLineOut(BaseModel):
    account_code: str
    amount_kurus: int
    side: AccountNormalBalance


class OpeningBalanceValidateResponse(BaseModel):
    valid: bool
    journal_lines: list[JournalLineOut]
    message: str


class OpeningBalancePostRequest(BaseModel):
    go_live_date: date
    actor_id: uuid.UUID
    lines: list[OpeningBalanceLineIn] = Field(min_length=1)


class SupplierLedgerEntryOut(BaseModel):
    id: uuid.UUID
    supplier_id: uuid.UUID


class OpeningBalancePostResponse(BaseModel):
    journal_entry_id: uuid.UUID
    journal_lines: list[JournalLineOut]
    supplier_ledger_entries: list[SupplierLedgerEntryOut]
    go_live_date: date
