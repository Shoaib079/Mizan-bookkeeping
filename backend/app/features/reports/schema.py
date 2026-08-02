"""Pydantic models for read-only reports."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

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


class SealedPeriodInfo(BaseModel):
    """Present when these figures are the ones the month was sealed with."""

    model_config = ConfigDict(from_attributes=True)

    period_start: date
    period_end: date
    closed_at: datetime
    #: Something was posted into the month after it was closed.
    drifted: bool = False
    #: How far the live books have moved from the sealed figures — the headline
    #: total, signed live-minus-sealed. None unless drifted.
    drift_kurus: int | None = None


class ProfitAndLossRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entity_id: uuid.UUID
    from_date: date
    to_date: date
    accounts: list[ProfitAndLossAccountRow]
    total_revenue_kurus: int
    total_expenses_kurus: int
    net_income_kurus: int
    #: "as_closed" when served from a closed month's snapshot, else "live".
    source: str = "live"
    sealed: SealedPeriodInfo | None = None


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
    source: str = "live"
    sealed: SealedPeriodInfo | None = None


class CashFlowCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    inflows_kurus: int
    outflows_kurus: int
    net_kurus: int


class CashFlowSourceRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    source: str
    category: str
    net_cash_kurus: int


class CashFlowRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entity_id: uuid.UUID
    from_date: date
    to_date: date
    opening_cash_kurus: int
    closing_cash_kurus: int
    net_change_kurus: int
    operating: CashFlowCategoryRead
    investing: CashFlowCategoryRead
    financing: CashFlowCategoryRead
    by_source: list[CashFlowSourceRow]
    reconciled_to_categories: bool


class KdvInputRateRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rate_percent: float
    base_kurus: int
    vat_kurus: int
    invoice_count: int


class KdvInputReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entity_id: uuid.UUID
    from_date: date
    to_date: date
    rates: list[KdvInputRateRow]
    total_base_kurus: int
    total_vat_kurus: int
    invoice_count: int


class PeriodMetricComparison(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    label: str
    current_kurus: int
    prior_kurus: int
    change_kurus: int
    change_percent: float | None = None


class PeriodComparisonRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entity_id: uuid.UUID
    current_from: date
    current_to: date
    prior_from: date
    prior_to: date
    metrics: list[PeriodMetricComparison]


class ExpenseRegisterRow(BaseModel):
    """One expense posting, whichever flow recorded it."""

    model_config = ConfigDict(from_attributes=True)

    entry_date: date
    account_id: uuid.UUID
    account_code: str
    account_name: str
    description: str
    source: str
    amount_kurus: int
    journal_entry_id: uuid.UUID


class ExpenseRegisterAccountTotal(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_id: uuid.UUID
    account_code: str
    account_name: str
    amount_kurus: int
    entry_count: int


class ExpenseRegisterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    from_date: date
    to_date: date
    rows: list[ExpenseRegisterRow]
    account_totals: list[ExpenseRegisterAccountTotal]
    total_kurus: int
    entry_count: int


class CashBookRow(BaseModel):
    """One movement through a cash drawer."""

    model_config = ConfigDict(from_attributes=True)

    entry_date: date
    description: str
    source: str
    in_kurus: int
    out_kurus: int
    balance_kurus: int
    journal_entry_id: uuid.UUID


class CashBookSourceTotal(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    source: str
    in_kurus: int
    out_kurus: int
    entry_count: int


class CashBookLastCount(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    session_date: date
    expected_kurus: int
    counted_kurus: int
    over_short_kurus: int


class CashBookRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    money_account_id: uuid.UUID
    money_account_name: str
    from_date: date
    to_date: date
    opening_kurus: int
    total_in_kurus: int
    total_out_kurus: int
    closing_kurus: int
    rows: list[CashBookRow]
    source_totals: list[CashBookSourceTotal]
    last_count: CashBookLastCount | None = None
    # Closed drawer counts, newest first — the over/short pattern over time.
    counts: list[CashBookLastCount] = Field(default_factory=list)


class UnreconciledLine(BaseModel):
    """A statement line that hasn't become a journal entry yet."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    statement_id: uuid.UUID
    transaction_date: date
    description: str
    amount_kurus: int
    status: str


class BankReconciliationAccount(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    money_account_id: uuid.UUID
    name: str
    account_kind: str
    book_balance_kurus: int
    book_balance_as_of: date | None = None
    imported_lines_total_kurus: int
    unreconciled_count: int
    unreconciled_total_kurus: int
    statement_period_end: date | None = None
    # What the bank printed, when known — lets us spot lines missing entirely.
    stated_closing_balance_kurus: int | None = None
    missing_from_import_kurus: int | None = None
    is_reconciled: bool = False
    latest_statement_id: uuid.UUID | None = None
    lines: list[UnreconciledLine] = Field(default_factory=list)


class BankReconciliationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    as_of: date | None = None
    accounts: list[BankReconciliationAccount] = Field(default_factory=list)
