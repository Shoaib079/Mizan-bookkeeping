"""Chart of accounts types — shared with opening balances and ledger (Phase 1)."""

from enum import Enum


class AccountType(str, Enum):
    ASSET = "asset"
    LIABILITY = "liability"
    EQUITY = "equity"
    REVENUE = "revenue"
    EXPENSE = "expense"


class AccountNormalBalance(str, Enum):
    DEBIT = "debit"
    CREDIT = "credit"
