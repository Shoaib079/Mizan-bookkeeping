"""Money type tests — integer kuruş, Turkish formatting (Decisions §5)."""

import pytest

from app.core.money import (
    amount_text_to_kurus,
    decimal_text_to_kurus,
    format_try,
    kurus_from_lira,
    parse_try_loose,
)

# FINANCIAL_AUDIT F1: `1.234` on an OCR'd slip is 1.234,00 ₺ in Turkish, not
# 1,23 ₺. The old parser read the first dot as a decimal point and understated
# amounts by 1000×. Table-driven so both parsers stay honest.
TURKISH_AMOUNT_CASES = [
    # (input, expected kuruş)
    ("1.234", 123_400),
    ("1.234.567", 123_456_700),
    ("1.234,56", 123_456),
    ("1.000.000,00", 100_000_000),
    ("12.345", 1_234_500),
    ("1234", 123_400),
    # 1–2 trailing digits can't be a thousands group, so they're decimals.
    ("123.45", 12_345),
    ("1.23", 123),
    ("0,50", 50),
    # More than 2 decimals round half-up rather than truncate.
    ("1.234,567", 123_457),
    ("999,999", 100_000),
    # Signs, parentheses and currency noise.
    ("-1.234", -123_400),
    ("(1.234,56)", -123_456),
    ("₺1.234,56", 123_456),
    ("1.234 TL", 123_400),
]


@pytest.mark.parametrize("text,expected", TURKISH_AMOUNT_CASES)
def test_amount_text_to_kurus_table(text: str, expected: int) -> None:
    assert amount_text_to_kurus(text) == expected


@pytest.mark.parametrize("text,expected", TURKISH_AMOUNT_CASES)
def test_parse_try_loose_table(text: str, expected: int) -> None:
    assert parse_try_loose(text) == expected


@pytest.mark.parametrize("text,_expected", TURKISH_AMOUNT_CASES)
def test_both_turkish_parsers_agree(text: str, _expected: int) -> None:
    """ARCHITECTURE: one Turkish number parser — never two that disagree."""
    assert amount_text_to_kurus(text) == parse_try_loose(text)


@pytest.mark.parametrize("text", ["", "   ", "abc", "1.2.a", "-", "₺"])
def test_amount_text_to_kurus_rejects_garbage(text: str) -> None:
    with pytest.raises(ValueError):
        amount_text_to_kurus(text)


# UBL/XML is machine-format: the dot is ALWAYS the decimal point. Routing these
# through the Turkish parser would read "1234.500" as 1.234.500 (1000× over).
DECIMAL_AMOUNT_CASES = [
    ("1234.56", 123_456),
    ("1234.5", 123_450),
    ("1234.500", 123_450),
    ("1234", 123_400),
    ("0.05", 5),
    ("1234.567", 123_457),  # rounds half-up, never truncates
    ("-1234.56", -123_456),
    (".5", 50),
]


@pytest.mark.parametrize("text,expected", DECIMAL_AMOUNT_CASES)
def test_decimal_text_to_kurus_table(text: str, expected: int) -> None:
    assert decimal_text_to_kurus(text) == expected


def test_decimal_parser_differs_from_turkish_on_three_decimals() -> None:
    """The two formats genuinely disagree — that's why both parsers exist."""
    assert decimal_text_to_kurus("1234.500") == 123_450
    assert amount_text_to_kurus("1.234") == 123_400


@pytest.mark.parametrize("text", ["", "abc", "1.2.3", "1,5", "-"])
def test_decimal_text_to_kurus_rejects_garbage(text: str) -> None:
    with pytest.raises(ValueError):
        decimal_text_to_kurus(text)


def test_kurus_from_lira() -> None:
    assert kurus_from_lira(1234, 56) == 123456


def test_format_try_positive() -> None:
    assert format_try(123456) == "1.234,56 ₺"


def test_format_try_negative() -> None:
    assert format_try(-500) == "-5,00 ₺"


def test_parse_try_loose_comma_decimal() -> None:
    assert parse_try_loose("1.234,56 ₺") == 123456


def test_parse_try_loose_invalid() -> None:
    with pytest.raises(ValueError):
        parse_try_loose("")
