"""Pricing a group sale line by total instead of per head.

You agree 94 USD for 6 people. 94 ÷ 6 is 15,6666…, so a per-person rate cannot
hold it: storing the rounded 15,67 and multiplying posts 94,02 — two cents more
than you agreed, on every line that does not divide evenly. So the total is
what posts, and the rate becomes a derived figure shown for reference.
"""

from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.features.group_sales.calculations import (
    _line_total_minor,
    _rate_per_person_minor,
)
from app.features.group_sales.schema import GroupSaleLineInput


def line(**kwargs) -> GroupSaleLineInput:
    return GroupSaleLineInput(menu_name="Set menu", **kwargs)


class TestExactlyOnePrice:
    def test_rejects_both(self):
        with pytest.raises(ValidationError):
            line(pax=6, rate_per_person_minor=1567, line_total_minor=9400)

    def test_rejects_neither(self):
        with pytest.raises(ValidationError):
            line(pax=6)

    def test_accepts_either(self):
        assert line(pax=6, rate_per_person_minor=1500).pax == 6
        assert line(pax=6, line_total_minor=9400).pax == 6


class TestTotalIsWhatPosts:
    def test_an_agreed_total_posts_exactly(self):
        # The case from the report: 94,00 for 6, not 94,02.
        entered = line(pax=6, line_total_minor=9400)
        assert _line_total_minor(entered) == 9400
        assert _rate_per_person_minor(entered) == 1567
        # Proof the old behaviour would have drifted.
        assert _rate_per_person_minor(entered) * entered.pax == 9402

    def test_a_rate_still_multiplies(self):
        entered = line(pax=6, rate_per_person_minor=1500)
        assert _line_total_minor(entered) == 9000
        assert _rate_per_person_minor(entered) == 1500

    @pytest.mark.parametrize(
        "total,pax,expected_rate",
        [
            (9400, 6, 1567),   # 15,6666… rounds up
            (9000, 6, 1500),   # divides evenly
            (10000, 3, 3333),  # 33,333… rounds down
            (100, 3, 33),      # tiny amounts
            (9999, 7, 1428),   # 14,2842… rounds down
        ],
    )
    def test_the_derived_rate_rounds_half_up(self, total, pax, expected_rate):
        entered = line(pax=pax, line_total_minor=total)
        assert _rate_per_person_minor(entered) == expected_rate
        # Whatever the rounding did, the posted figure is untouched.
        assert _line_total_minor(entered) == total

    def test_rounding_never_goes_through_a_float(self):
        # 0,005 cases are where float arithmetic picks the wrong direction.
        entered = line(pax=2, line_total_minor=101)
        assert _rate_per_person_minor(entered) == 51  # 50,5 → 51, not 50
