"""Verified Clerk session token claims (Phase 8 launch)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ClerkClaims:
    clerk_user_id: str
    email: str
    email_verified: bool
