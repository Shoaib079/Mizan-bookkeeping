"""Bank statement lira parsing and Excel import tests."""

from __future__ import annotations

import io
from datetime import date
from pathlib import Path

import pytest

from app.adapters.bank_parsers.amount_lira import parse_lira_to_kurus
from app.adapters.bank_parsers.csv_simple import parse_csv_simple
from app.adapters.bank_parsers.dispatch import parse_bank_statement, resolve_statement_format
from app.adapters.bank_parsers.row_parse import coerce_transaction_date
from app.adapters.bank_parsers.types import BankParseError
from app.adapters.bank_parsers.xls_simple import parse_xls_simple
from app.adapters.bank_parsers.xlsx_simple import parse_xlsx_simple
from app.core.chart_of_accounts.seed import seed_default_chart
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "bank_statements"
SAMPLE_CSV = FIXTURES / "sample.csv"
SAMPLE_XLS = FIXTURES / "sample.xls"
SAMPLE_TYPED_XLSX = FIXTURES / "sample_typed_dates.xlsx"
SAMPLE_BAD_XLS = FIXTURES / "sample_bad_amount.xls"


def _line_tuples(parsed):
    return [
        (line.transaction_date, line.amount_kurus, line.description, line.reference)
        for line in parsed.lines
    ]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("12,50", 1250),
        ("1.234,56", 123456),
        ("-45,00", -4500),
        ("1234.56", 123456),
        ("-45", -4500),
        ("150", 15000),
    ],
)
def test_parse_lira_to_kurus_exact(raw: str, expected: int) -> None:
    assert parse_lira_to_kurus(raw, row_num=2) == expected


@pytest.mark.parametrize(
    ("raw", "message_part"),
    [
        ("12,505", "max 2 decimals"),
        ("abc", "numeric lira"),
        ("", "required"),
        ("0", "non-zero"),
        ("0,00", "non-zero"),
    ],
)
def test_parse_lira_to_kurus_rejects_invalid(raw: str, message_part: str) -> None:
    with pytest.raises(BankParseError) as exc:
        parse_lira_to_kurus(raw, row_num=5)
    assert f"row 5" in str(exc.value)
    assert message_part in str(exc.value)


def test_coerce_transaction_date_from_datetime_and_iso_string() -> None:
    assert coerce_transaction_date(date(2026, 2, 1), row_num=2) == date(2026, 2, 1)
    assert coerce_transaction_date("2026-02-01", row_num=2) == date(2026, 2, 1)


def test_resolve_statement_format_routes_xls_mime_to_xls() -> None:
    assert (
        resolve_statement_format(
            original_filename="statement.xls",
            content_type="application/vnd.ms-excel",
        )
        == ".xls"
    )
    assert (
        resolve_statement_format(
            original_filename="statement.xlsx",
            content_type="application/vnd.ms-excel",
        )
        == ".xlsx"
    )


def _csv_bytes(*rows: str) -> bytes:
    header = "transaction_date,amount,description,reference"
    body = "\n".join([header, *rows])
    return body.encode()


def test_xls_fixture_matches_csv() -> None:
    csv = parse_csv_simple(SAMPLE_CSV.read_bytes())
    xls = parse_xls_simple(SAMPLE_XLS.read_bytes())
    assert _line_tuples(xls) == _line_tuples(csv)


def test_xlsx_typed_dates_fixture_matches_csv() -> None:
    csv = parse_csv_simple(SAMPLE_CSV.read_bytes())
    xlsx = parse_xlsx_simple(SAMPLE_TYPED_XLSX.read_bytes())
    assert _line_tuples(xlsx) == _line_tuples(csv)


def test_xls_bad_amount_rejected_with_row_number() -> None:
    with pytest.raises(BankParseError) as exc:
        parse_xls_simple(SAMPLE_BAD_XLS.read_bytes())
    assert "row 2" in str(exc.value)


def test_csv_rejects_three_decimal_places_with_row_number() -> None:
    content = _csv_bytes('2026-02-01,"12,505",Bad amount,REF-1')
    with pytest.raises(BankParseError) as exc:
        parse_csv_simple(content)
    assert "row 2" in str(exc.value)


@pytest.fixture
def bank_account(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    return banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Import TRY",
            bank_name="Test Bank",
        ),
    )


def test_xls_import_duplicate_fingerprint_rejected(db_session, restaurant_a, bank_account) -> None:
    content = SAMPLE_XLS.read_bytes()
    statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        content,
        original_filename="feb.xls",
        content_type="application/vnd.ms-excel",
    )
    with pytest.raises(statement_service.DuplicateStatementError):
        statement_service.import_bank_statement(
            db_session,
            restaurant_a.id,
            bank_account.id,
            content,
            original_filename="feb-copy.xls",
            content_type="application/vnd.ms-excel",
        )


def test_xls_period_overlap_still_enforced(db_session, restaurant_a, bank_account) -> None:
    import xlwt

    def _single_row_xls(amount: str) -> bytes:
        wb = xlwt.Workbook()
        ws = wb.add_sheet("Sheet1")
        style = xlwt.XFStyle()
        style.num_format_str = "YYYY-MM-DD"
        ws.write(0, 0, "transaction_date")
        ws.write(0, 1, "amount")
        ws.write(0, 2, "description")
        ws.write(0, 3, "reference")
        ws.write(1, 0, date(2026, 3, 1), style)
        ws.write(1, 1, amount)
        ws.write(1, 2, "Row")
        ws.write(1, 3, "REF")
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        _single_row_xls("-100,00"),
        original_filename="mar-a.xls",
        content_type="application/vnd.ms-excel",
    )
    with pytest.raises(statement_service.OverlappingPeriodError):
        statement_service.import_bank_statement(
            db_session,
            restaurant_a.id,
            bank_account.id,
            _single_row_xls("-200,00"),
            original_filename="mar-b.xls",
            content_type="application/vnd.ms-excel",
        )


def test_dispatch_routes_legacy_xls_not_openpyxl() -> None:
    parsed = parse_bank_statement(
        SAMPLE_XLS.read_bytes(),
        original_filename="sample.xls",
        content_type="application/vnd.ms-excel",
    )
    csv = parse_csv_simple(SAMPLE_CSV.read_bytes())
    assert _line_tuples(parsed) == _line_tuples(csv)


def test_boot_imports_without_xlrd(monkeypatch) -> None:
    """App boot must not require xlrd — only .xls parse time does."""
    import builtins
    import importlib
    import sys

    real_import = builtins.__import__

    def blocked_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "xlrd" or name.startswith("xlrd."):
            raise ImportError("No module named 'xlrd'")
        return real_import(name, globals, locals, fromlist, level)

    for mod in (
        "xlrd",
        "app.adapters.bank_parsers.xls_simple",
        "app.adapters.bank_parsers.dispatch",
        "app.features.banking.statements",
        "app.features.banking.statements_api",
        "app.features.banking.api",
    ):
        monkeypatch.delitem(sys.modules, mod, raising=False)

    monkeypatch.setattr(builtins, "__import__", blocked_import)

    dispatch = importlib.import_module("app.adapters.bank_parsers.dispatch")
    banking_api = importlib.import_module("app.features.banking.api")
    statements_api = importlib.import_module("app.features.banking.statements_api")

    assert callable(dispatch.parse_bank_statement)
    assert banking_api.router is not None
    assert statements_api.accounts_router is not None


def test_parse_xls_simple_reports_missing_xlrd(monkeypatch) -> None:
    import builtins
    import importlib
    import sys

    real_import = builtins.__import__

    def blocked_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "xlrd" or name.startswith("xlrd."):
            raise ImportError("No module named 'xlrd'")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.delitem(sys.modules, "app.adapters.bank_parsers.xls_simple", raising=False)
    monkeypatch.setattr(builtins, "__import__", blocked_import)

    xls_simple = importlib.import_module("app.adapters.bank_parsers.xls_simple")
    with pytest.raises(BankParseError, match="Excel .xls support is unavailable"):
        xls_simple.parse_xls_simple(b"not-empty")

