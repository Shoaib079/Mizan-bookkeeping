"""Bank statement lira parsing and Excel import tests."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from openpyxl import Workbook

from app.adapters.bank_parsers.amount_lira import parse_lira_to_kurus
from app.adapters.bank_parsers.csv_simple import parse_csv_simple
from app.adapters.bank_parsers.types import BankParseError
from app.adapters.bank_parsers.xlsx_simple import parse_xlsx_simple
from app.core.chart_of_accounts.seed import seed_default_chart
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate

FIXTURES = Path(__file__).resolve().parent / "fixtures"
SAMPLE_CSV = FIXTURES / "bank_statements" / "sample.csv"


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


def _csv_bytes(*rows: str) -> bytes:
    header = "transaction_date,amount,description,reference"
    body = "\n".join([header, *rows])
    return body.encode()


def _xlsx_bytes(*rows: tuple[str, str, str, str | None]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(["transaction_date", "amount", "description", "reference"])
    for row in rows:
        ws.append(list(row))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_xlsx_parses_same_as_csv() -> None:
    csv = parse_csv_simple(SAMPLE_CSV.read_bytes())
    xlsx = parse_xlsx_simple(
        _xlsx_bytes(
            ("2026-02-01", "-50.000,00", "Payment to Metro Gida", "EFT-001"),
            ("2026-02-03", "-250,00", "Bank service fee", "FEE-FEB"),
            ("2026-02-05", "10.000,00", "Customer refund reversal", "REF-99"),
        )
    )
    assert [(line.transaction_date, line.amount_kurus, line.description) for line in csv.lines] == [
        (line.transaction_date, line.amount_kurus, line.description) for line in xlsx.lines
    ]


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


def test_xlsx_import_duplicate_fingerprint_rejected(db_session, restaurant_a, bank_account) -> None:
    content = _xlsx_bytes(("2026-02-01", "-100,00", "Fee", "X-1"))
    statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        content,
        original_filename="feb.xlsx",
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    with pytest.raises(statement_service.DuplicateStatementError):
        statement_service.import_bank_statement(
            db_session,
            restaurant_a.id,
            bank_account.id,
            content,
            original_filename="feb-copy.xlsx",
        )


def test_period_overlap_still_enforced(db_session, restaurant_a, bank_account) -> None:
    first = _csv_bytes('2026-03-01,"-100,00",First,REF-A')
    second = _csv_bytes('2026-03-01,"-200,00",Second,REF-B')
    statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        first,
        original_filename="mar-a.csv",
    )
    with pytest.raises(statement_service.OverlappingPeriodError):
        statement_service.import_bank_statement(
            db_session,
            restaurant_a.id,
            bank_account.id,
            second,
            original_filename="mar-b.csv",
        )
