"""Entity role types — Decisions §18."""

from __future__ import annotations

from enum import StrEnum


class EntityRole(StrEnum):
    OWNER = "owner"
    PARTNER = "partner"
    CASHIER = "cashier"
    PARTNER_VIEW_ONLY = "partner_view_only"
