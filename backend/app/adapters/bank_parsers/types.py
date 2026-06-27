"""Shared bank statement parser types (Decisions §12)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


class BankParseError(ValueError):
    """Raised when statement file content is invalid or missing required columns."""


@dataclass(frozen=True, slots=True)
class ParsedStatementLine:
    transaction_date: date
    amount_kurus: int
    description: str
    reference: str | None


@dataclass(frozen=True, slots=True)
class ParsedStatement:
    lines: list[ParsedStatementLine]
    period_start: date
    period_end: date
