"""Undeposited card-sales aging — pure bucketing logic (no DB, unit-testable).

The card clearing account (1400) is a pooled acquirer receivable: gross card
sales go in, bank deposits take money out. Under FIFO — the bank settles the
oldest sales first — whatever is still sitting in clearing is the *newest* card
sales. This module attributes the current clearing balance to the most recent
non-voided batches and buckets that residual by age, so the UI can show how long
card money has been waiting for the bank to deposit it.
"""

from __future__ import annotations

from datetime import date

# (label, inclusive upper bound in days). None = open-ended final bucket.
AGING_BUCKETS: tuple[tuple[str, int | None], ...] = (
    ("0–3 days", 3),
    ("4–7 days", 7),
    ("8–14 days", 14),
    ("15+ days", None),
)


def bucket_label_for_age(age_days: int) -> str:
    """Return the aging bucket label for a sale that is ``age_days`` old."""
    for label, upper in AGING_BUCKETS:
        if upper is None or age_days <= upper:
            return label
    return AGING_BUCKETS[-1][0]


def compute_undeposited_aging(
    batches_newest_first: list[tuple[date, int]],
    clearing_balance_kurus: int,
    today: date,
) -> dict[str, int]:
    """Attribute the clearing balance to the newest sales (FIFO) and bucket by age.

    ``batches_newest_first`` is a list of ``(sales_date, gross_kurus)`` for
    non-voided card sales batches, ordered newest first. Returns a mapping of
    every bucket label to its undeposited kuruş (0 when empty).
    """
    result: dict[str, int] = {label: 0 for label, _ in AGING_BUCKETS}
    remaining = max(int(clearing_balance_kurus), 0)
    for sales_date, gross in batches_newest_first:
        if remaining <= 0:
            break
        take = min(int(gross), remaining)
        if take <= 0:
            continue
        age_days = (today - sales_date).days
        result[bucket_label_for_age(age_days)] += take
        remaining -= take
    return result
