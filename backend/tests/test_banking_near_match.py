"""Near-match date window for bank statement payment/transfer linking."""

from datetime import date

import pytest

from app.core.banking.matching import (
    NEAR_MATCH_DATE_WINDOW_DAYS,
    is_near_match_date,
    near_match_date_bounds,
)


def test_near_match_date_bounds() -> None:
    target = date(2026, 2, 10)
    low, high = near_match_date_bounds(target)
    assert low == date(2026, 2, 7)
    assert high == date(2026, 2, 13)


def test_is_near_match_excludes_exact_date() -> None:
    target = date(2026, 2, 10)
    assert is_near_match_date(date(2026, 2, 10), target) is False


def test_is_near_match_within_window() -> None:
    target = date(2026, 2, 10)
    assert is_near_match_date(date(2026, 2, 8), target) is True
    assert is_near_match_date(date(2026, 2, 13), target) is True


def test_is_near_match_outside_window() -> None:
    target = date(2026, 2, 10)
    assert is_near_match_date(date(2026, 2, 6), target) is False
    assert is_near_match_date(date(2026, 2, 14), target) is False


def test_default_window_is_three_days() -> None:
    assert NEAR_MATCH_DATE_WINDOW_DAYS == 3
