"""Pydantic models for read-only reports."""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict

from app.core.chart_of_accounts.types import AccountType


class DeliverySalesPlatformRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    delivery_platform_id: uuid.UUID
    platform_name: str
    is_active: bool
    gross_kurus: int
    report_count: int


class DeliverySalesReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entity_id: uuid.UUID
    from_date: date
    to_date: date
    platforms: list[DeliverySalesPlatformRow]
    total_gross_kurus: int


class ProfitAndLossAccountRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_id: uuid.UUID
    code: str
    name_en: str
    account_type: AccountType
    amount_kurus: int


class ProfitAndLossRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entity_id: uuid.UUID
    from_date: date
    to_date: date
    accounts: list[ProfitAndLossAccountRow]
    total_revenue_kurus: int
    total_expenses_kurus: int
    net_income_kurus: int


class BalanceSheetAccountRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_id: uuid.UUID
    code: str
    name_en: str
    account_type: AccountType
    balance_kurus: int


class BalanceSheetSection(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    accounts: list[BalanceSheetAccountRow]
    subtotal_kurus: int


class BalanceSheetEquitySection(BalanceSheetSection):
    unclosed_net_income_kurus: int


class BalanceSheetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entity_id: uuid.UUID
    as_of: date
    assets: BalanceSheetSection
    liabilities: BalanceSheetSection
    equity: BalanceSheetEquitySection
    total_assets_kurus: int
    total_liabilities_kurus: int
    total_equity_kurus: int
    total_liabilities_and_equity_kurus: int
    accounting_equation_balanced: bool
