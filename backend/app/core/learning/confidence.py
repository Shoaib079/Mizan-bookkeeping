"""Shared confidence thresholds for all learned document rules."""

from __future__ import annotations

from typing import Literal

HIGH_CONFIDENCE_THRESHOLD = 3
RECENT_HITS_WITHOUT_CORRECTION = 3

ConfidenceLabel = Literal["high", "medium", "low"]


def is_high_confidence(
    confirmation_count: int,
    confirmations_since_correction: int,
) -> bool:
    return (
        confirmation_count >= HIGH_CONFIDENCE_THRESHOLD
        and confirmations_since_correction >= RECENT_HITS_WITHOUT_CORRECTION
    )


def confidence_label(
    confirmation_count: int,
    confirmations_since_correction: int,
) -> ConfidenceLabel:
    if is_high_confidence(confirmation_count, confirmations_since_correction):
        return "high"
    if confirmation_count >= 2:
        return "medium"
    return "low"
