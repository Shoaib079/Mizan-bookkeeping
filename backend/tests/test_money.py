"""Money type tests — integer kuruş, Turkish formatting (Decisions §5)."""

import pytest

from app.core.money import format_try, kurus_from_lira, parse_try_loose


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
