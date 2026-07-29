"""Which period a comparison compares against (BUGLOG 2026-07-29).

Shifting back by the same number of days is right for an arbitrary window and
wrong for a calendar month. July is 31 days, so July 2026 was being compared
against 31 May – 30 June, which is not a month.

Pure date logic — no database, no fixtures.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.features.reports.period_comparison import (
    _prior_period,
    is_whole_month,
    is_whole_year,
)


def test_the_reported_case_july_compares_against_june():
    assert _prior_period(date(2026, 7, 1), date(2026, 7, 31)) == (
        date(2026, 6, 1),
        date(2026, 6, 30),
    )


def test_march_compares_against_a_short_february():
    """The whole point: months are not equal length."""
    assert _prior_period(date(2026, 3, 1), date(2026, 3, 31)) == (
        date(2026, 2, 1),
        date(2026, 2, 28),
    )


def test_february_in_a_leap_year_keeps_its_29th():
    assert _prior_period(date(2028, 3, 1), date(2028, 3, 31)) == (
        date(2028, 2, 1),
        date(2028, 2, 29),
    )


def test_january_compares_against_last_december():
    assert _prior_period(date(2026, 1, 1), date(2026, 1, 31)) == (
        date(2025, 12, 1),
        date(2025, 12, 31),
    )


def test_a_whole_year_compares_against_the_previous_year():
    """Day-shifting a year drifts by a day whenever a leap year is involved."""
    assert _prior_period(date(2026, 1, 1), date(2026, 12, 31)) == (
        date(2025, 1, 1),
        date(2025, 12, 31),
    )


def test_a_partial_month_still_uses_an_equal_length_window():
    """No calendar answer exists for 1–15 July, so equal length is the only
    defensible rule — 15 days ending the day before."""
    assert _prior_period(date(2026, 7, 1), date(2026, 7, 15)) == (
        date(2026, 6, 16),
        date(2026, 6, 30),
    )


def test_an_arbitrary_window_is_unchanged():
    assert _prior_period(date(2026, 7, 5), date(2026, 7, 20)) == (
        date(2026, 6, 19),
        date(2026, 7, 4),
    )


def test_a_single_day_compares_against_the_day_before():
    assert _prior_period(date(2026, 7, 15), date(2026, 7, 15)) == (
        date(2026, 7, 14),
        date(2026, 7, 14),
    )


def test_the_prior_period_never_overlaps_the_current_one():
    """Whatever the rule, the comparison would be meaningless if it did."""
    ranges = [
        (date(2026, 7, 1), date(2026, 7, 31)),
        (date(2026, 3, 1), date(2026, 3, 31)),
        (date(2026, 1, 1), date(2026, 12, 31)),
        (date(2026, 7, 1), date(2026, 7, 15)),
        (date(2026, 7, 5), date(2026, 7, 20)),
        (date(2026, 2, 15), date(2026, 2, 15)),
    ]
    for from_date, to_date in ranges:
        prior_from, prior_to = _prior_period(from_date, to_date)
        assert prior_from <= prior_to
        assert prior_to < from_date


@pytest.mark.parametrize(
    ("from_date", "to_date", "expected"),
    [
        (date(2026, 7, 1), date(2026, 7, 31), True),
        (date(2026, 2, 1), date(2026, 2, 28), True),
        (date(2028, 2, 1), date(2028, 2, 29), True),
        # 28 Feb is not the last day of a leap February.
        (date(2028, 2, 1), date(2028, 2, 28), False),
        (date(2026, 7, 2), date(2026, 7, 31), False),
        (date(2026, 7, 1), date(2026, 7, 30), False),
        (date(2026, 7, 1), date(2026, 8, 31), False),
    ],
)
def test_is_whole_month(from_date, to_date, expected):
    assert is_whole_month(from_date, to_date) is expected


@pytest.mark.parametrize(
    ("from_date", "to_date", "expected"),
    [
        (date(2026, 1, 1), date(2026, 12, 31), True),
        (date(2026, 1, 1), date(2026, 12, 30), False),
        (date(2026, 2, 1), date(2026, 12, 31), False),
        (date(2026, 1, 1), date(2027, 12, 31), False),
    ],
)
def test_is_whole_year(from_date, to_date, expected):
    assert is_whole_year(from_date, to_date) is expected
