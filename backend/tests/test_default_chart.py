"""Tests for default chart seed — Opening Balance Equity and OB-eligible accounts."""

from app.core.chart_of_accounts.default_chart import (
    DELIVERY_CLEARING_PARENT_CODE,
    OPENING_BALANCE_EQUITY_CODE,
    opening_balance_accounts,
)


def test_default_chart_includes_opening_balance_equity() -> None:
    from app.core.chart_of_accounts.default_chart import DEFAULT_CHART

    codes = {a.code for a in DEFAULT_CHART}
    assert OPENING_BALANCE_EQUITY_CODE in codes
    equity = next(a for a in DEFAULT_CHART if a.code == OPENING_BALANCE_EQUITY_CODE)
    assert equity.name_en == "Opening Balance Equity"
    assert equity.accepts_opening_balance is False


def test_default_chart_includes_input_vat() -> None:
    from app.core.chart_of_accounts.default_chart import DEFAULT_CHART

    codes = {a.code for a in DEFAULT_CHART}
    assert "1500" in codes
    vat = next(a for a in DEFAULT_CHART if a.code == "1500")
    assert vat.name_en == "Input VAT"
    assert vat.accepts_opening_balance is False


def test_default_chart_includes_delivery_clearing_parent() -> None:
    from app.core.chart_of_accounts.default_chart import DEFAULT_CHART

    codes = {a.code for a in DEFAULT_CHART}
    assert DELIVERY_CLEARING_PARENT_CODE in codes
    parent = next(a for a in DEFAULT_CHART if a.code == DELIVERY_CLEARING_PARENT_CODE)
    assert parent.name_en == "Delivery Platform Clearing"


def test_inventory_not_in_default_chart() -> None:
    from app.core.chart_of_accounts.default_chart import DEFAULT_CHART

    names = {a.name_en.lower() for a in DEFAULT_CHART}
    assert "inventory" not in names


def test_default_chart_includes_tips_expense_not_payable() -> None:
    from app.core.chart_of_accounts.default_chart import DEFAULT_CHART, TIPS_EXPENSE_CODE
    from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType

    codes = {a.code for a in DEFAULT_CHART}
    assert "2260" not in codes  # Tips Payable retired (tips are an expense)
    assert TIPS_EXPENSE_CODE in codes
    tips = next(a for a in DEFAULT_CHART if a.code == TIPS_EXPENSE_CODE)
    assert tips.name_en == "Tips Expense"
    assert tips.account_type == AccountType.EXPENSE
    assert tips.normal_balance == AccountNormalBalance.DEBIT
    assert tips.accepts_opening_balance is False


def test_opening_balance_accounts_are_balance_sheet() -> None:
    ob = opening_balance_accounts()
    assert len(ob) >= 5
    assert all(a.accepts_opening_balance for a in ob)
    assert all(a.code != OPENING_BALANCE_EQUITY_CODE for a in ob)
