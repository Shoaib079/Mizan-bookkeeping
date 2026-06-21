"""Bank statement auto-match helpers — exact and near-date windows (Decisions §12)."""

from __future__ import annotations

from datetime import date, timedelta

# Days ± transaction date for near-match detection (supplier payments, transfers).
NEAR_MATCH_DATE_WINDOW_DAYS = 3


def near_match_date_bounds(
    target: date, *, window_days: int = NEAR_MATCH_DATE_WINDOW_DAYS
) -> tuple[date, date]:
    """Inclusive date range for near matches, excluding the exact target date."""
    return target - timedelta(days=window_days), target + timedelta(days=window_days)


def is_near_match_date(
    candidate: date,
    target: date,
    *,
    window_days: int = NEAR_MATCH_DATE_WINDOW_DAYS,
) -> bool:
    """True when candidate is within the window but not on the exact target date."""
    if candidate == target:
        return False
    low, high = near_match_date_bounds(target, window_days=window_days)
    return low <= candidate <= high
