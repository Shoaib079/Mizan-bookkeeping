"""Ledger repair recipe types."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session


@dataclass(frozen=True, slots=True)
class RepairReport:
    """Outcome of one repair recipe on one entity."""

    repair_key: str
    skipped: bool = False
    details: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> dict[str, Any]:
        return {
            "repair_key": self.repair_key,
            "skipped": self.skipped,
            **self.details,
        }


RepairApply = Callable[[Session, uuid.UUID], RepairReport]


@dataclass(frozen=True, slots=True)
class RepairSpec:
    key: str
    description: str
    apply: RepairApply
