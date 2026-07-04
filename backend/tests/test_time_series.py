"""Tests for time_series module (DASH-B)."""

import pytest
from datetime import date

from app.features.reports.time_series import (
    DailyPoint,
    ExpenseByAccount,
    ExpenseByItem,
    SpendBySupplier,
    TimeSeriesRead,
    _merge_daily,
)


class TestMergeDaily:
    def test_empty_sales_and_expenses(self):
        result = _merge_daily({}, {}, date(2026, 1, 1), date(2026, 1, 31))
        assert result == []

    def test_sales_only(self):
        sales = {date(2026, 1, 5): 10000, date(2026, 1, 10): 20000}
        result = _merge_daily(sales, {}, date(2026, 1, 1), date(2026, 1, 31))
        assert len(result) == 2
        assert result[0] == DailyPoint(
            date=date(2026, 1, 5),
            sales_kurus=10000,
            expenses_kurus=0,
            net_kurus=10000,
        )

    def test_expenses_only(self):
        expenses = {date(2026, 1, 3): 5000}
        result = _merge_daily({}, expenses, date(2026, 1, 1), date(2026, 1, 31))
        assert len(result) == 1
        assert result[0].net_kurus == -5000

    def test_merged_dates_sorted(self):
        sales = {date(2026, 1, 10): 1000}
        expenses = {date(2026, 1, 5): 2000, date(2026, 1, 10): 500}
        result = _merge_daily(sales, expenses, date(2026, 1, 1), date(2026, 1, 31))
        assert len(result) == 2
        assert result[0].date == date(2026, 1, 5)
        assert result[1].date == date(2026, 1, 10)
        assert result[1].net_kurus == 500

    def test_filters_out_of_range_dates(self):
        sales = {
            date(2025, 12, 31): 9999,
            date(2026, 1, 1): 1000,
            date(2026, 2, 1): 8888,
        }
        result = _merge_daily(sales, {}, date(2026, 1, 1), date(2026, 1, 31))
        assert len(result) == 1
        assert result[0].date == date(2026, 1, 1)

    def test_net_is_sales_minus_expenses(self):
        sales = {date(2026, 1, 1): 30000}
        expenses = {date(2026, 1, 1): 12000}
        result = _merge_daily(sales, expenses, date(2026, 1, 1), date(2026, 1, 1))
        assert result[0].net_kurus == 18000


class TestTimeSeriesReadSchema:
    def test_serializes_correctly(self):
        ts = TimeSeriesRead(
            entity_id="abc",
            from_date=date(2026, 1, 1),
            to_date=date(2026, 1, 31),
            daily=[
                DailyPoint(
                    date=date(2026, 1, 5),
                    sales_kurus=10000,
                    expenses_kurus=3000,
                    net_kurus=7000,
                )
            ],
            expenses_by_account=[
                ExpenseByAccount(
                    account_id="a1",
                    account_code="5200",
                    account_name="General Expense",
                    total_kurus=3000,
                )
            ],
            expenses_by_item=[
                ExpenseByItem(
                    expense_item_id="i1",
                    canonical_name="Peynir",
                    total_kurus=1500,
                )
            ],
            spend_by_supplier=[
                SpendBySupplier(
                    supplier_id="s1",
                    supplier_name="Metro",
                    total_kurus=42000,
                )
            ],
        )
        d = ts.model_dump()
        assert d["entity_id"] == "abc"
        assert len(d["daily"]) == 1
        assert d["daily"][0]["net_kurus"] == 7000
        assert d["expenses_by_account"][0]["account_code"] == "5200"
        assert d["expenses_by_item"][0]["canonical_name"] == "Peynir"
        assert d["spend_by_supplier"][0]["supplier_name"] == "Metro"
        assert d["spend_by_supplier"][0]["total_kurus"] == 42000
