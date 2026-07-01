"""Shared learning domain identifiers."""

from __future__ import annotations

import enum


class LearningDomain(str, enum.Enum):
    BANK_STATEMENT = "bank_statement"
    INVOICE = "invoice"
    EXPENSE_RECEIPT = "expense_receipt"
    BANK_IMPORT = "bank_import"
