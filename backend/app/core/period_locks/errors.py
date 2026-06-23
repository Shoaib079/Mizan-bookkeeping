"""Period lock and go-live validation errors — posting boundary (Phase 8.5 Slice 4)."""

from __future__ import annotations

from app.core.ledger.errors import PostingError


class BeforeGoLiveError(PostingError):
    """Entry date is before entity go-live."""


class PeriodLockedError(PostingError):
    """Write touches a soft-locked period without owner unlock."""


class PeriodUnlockRequiredError(PostingError):
    """Owner must supply period_unlock_reason to write in a closed period."""
