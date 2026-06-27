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


def test_default_chart_excludes_tips_expense_account() -> None:
    from app.core.chart_of_accounts.default_chart import DEFAULT_CHART

    codes = {a.code for a in DEFAULT_CHART}
    assert "2260" not in codes  # Tips Payable retired
    assert "5700" not in codes  # Tips Expense removed — tips use any expense category


def test_default_chart_includes_common_expense_categories() -> None:
    from app.core.chart_of_accounts.default_chart import (
        ADVERTISING_EXPENSE_CODE,
        CLEANING_EXPENSE_CODE,
        DEFAULT_CHART,
        GENERAL_EXPENSE_CODE,
        OFFICE_EXPENSE_CODE,
        REPAIRS_EXPENSE_CODE,
        SUPPLIES_EXPENSE_CODE,
        TRANSPORT_EXPENSE_CODE,
        UTILITIES_EXPENSE_CODE,
    )

    codes = {a.code for a in DEFAULT_CHART}
    for code in (
        "5000",
        "5100",
        GENERAL_EXPENSE_CODE,
        UTILITIES_EXPENSE_CODE,
        SUPPLIES_EXPENSE_CODE,
        REPAIRS_EXPENSE_CODE,
        ADVERTISING_EXPENSE_CODE,
        TRANSPORT_EXPENSE_CODE,
        CLEANING_EXPENSE_CODE,
        OFFICE_EXPENSE_CODE,
        "5300",
        "5400",
        "5500",
        "5600",
    ):
        assert code in codes

    general = next(a for a in DEFAULT_CHART if a.code == GENERAL_EXPENSE_CODE)
    assert general.name_en == "General Expense"
    assert general.name_tr == "Genel Giderler"


def test_opening_balance_accounts_are_balance_sheet() -> None:
    ob = opening_balance_accounts()
    assert len(ob) >= 5
    assert all(a.accepts_opening_balance for a in ob)
    assert all(a.code != OPENING_BALANCE_EQUITY_CODE for a in ob)
