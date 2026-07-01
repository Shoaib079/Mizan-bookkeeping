"""Unified document learning — confidence, corrections, cross-intake patterns."""

from app.core.learning.confidence import (
    HIGH_CONFIDENCE_THRESHOLD,
    RECENT_HITS_WITHOUT_CORRECTION,
    confidence_label,
    is_high_confidence,
)
from app.core.learning.correction_events import record_learning_correction
from app.core.learning.types import LearningDomain

__all__ = [
    "HIGH_CONFIDENCE_THRESHOLD",
    "RECENT_HITS_WITHOUT_CORRECTION",
    "LearningDomain",
    "confidence_label",
    "is_high_confidence",
    "record_learning_correction",
]
