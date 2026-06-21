"""Onboarding wizard schemas — opening balances plan (Decisions §19)."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field

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
    account_code: str = Field(min_length=1, max_length=16)
    amount_kurus: int = Field(gt=0)
    side: AccountNormalBalance


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
