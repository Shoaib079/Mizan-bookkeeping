"""Cash drawer lock errors — mirror period-lock posting errors (Phase 11 Slice 11.13)."""

from __future__ import annotations

from app.core.ledger.errors import PostingError


class DrawerDayClosedError(PostingError):
    """Write touches a closed drawer day without owner unlock."""


class DrawerUnlockRequiredError(PostingError):
    """Owner must supply period_unlock_reason to write in a closed drawer day."""
