"""FX movement types — append-only subledger (Decisions §15)."""

from __future__ import annotations

import enum


class FxMovementType(str, enum.Enum):
    PURCHASE = "purchase"
