"""Pydantic models for entity dashboard summary."""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from app.features.reports.schema import DeliverySalesPlatformRow


class PeriodSalesRead(BaseModel):
    cash_sales_kurus: int
    pos_card_sales_kurus: int
    delivery_sales_kurus: int
    group_sales_kurus: int
    other_sales_kurus: int
    total_sales_kurus: int


class PayablePreviewRow(BaseModel):
    supplier_id: uuid.UUID
    supplier_name: str
    balance_kurus: int


class DeliveryBalanceLeftRow(BaseModel):
    delivery_platform_id: uuid.UUID
    platform_name: str
    balance_left_kurus: int


class FxBalanceRow(BaseModel):
    money_account_id: uuid.UUID
    name: str
    currency: str
    native_quantity: int
    try_cost_kurus: int


class NeedsReviewBreakdown(BaseModel):
    invoice_drafts: int
    invoice_duplicates: int
    bank_statement_lines: int
    pos_daily_summaries: int
    delivery_reports: int
    expense_entries: int
    total: int


class DashboardRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entity_id: uuid.UUID
    from_date: date
    to_date: date
    sales: PeriodSalesRead
    delivery_platforms: list[DeliverySalesPlatformRow] = Field(
        default_factory=list,
        description="Gross per platform in range; empty when delivery module disabled",
    )
    total_expenses_kurus: int
    net_result_kurus: int
    total_payables_kurus: int
    payables_preview: list[PayablePreviewRow]
    total_receivables_kurus: int
    delivery_balance_left: list[DeliveryBalanceLeftRow] = Field(
        default_factory=list,
        description="Per-platform gross − commission posted − bank settled; empty when delivery disabled",
    )
    total_try_position_kurus: int
    fx_balances: list[FxBalanceRow] = Field(default_factory=list)
    tax_department_payments_kurus: int | None = None
    needs_review: NeedsReviewBreakdown
    confirmed_invoice_drafts: int = Field(
        default=0,
        description="Confirmed e-Fatura drafts awaiting post-to-ledger",
    )
