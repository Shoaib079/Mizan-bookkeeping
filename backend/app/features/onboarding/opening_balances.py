"""Opening balance validation — day-one ledger drafts (Decisions §19). Phase 1 posts via core/ledger."""

from __future__ import annotations

from dataclasses import dataclass

from app.core.chart_of_accounts.default_chart import (
    OPENING_BALANCE_EQUITY_CODE,
    chart_by_code,
    opening_balance_accounts,
)
from app.core.chart_of_accounts.types import AccountNormalBalance


class OpeningBalanceError(ValueError):
    """Opening balance set fails validation."""


@dataclass(frozen=True, slots=True)
class OpeningBalanceLine:
    account_code: str
    amount_kurus: int
    side: AccountNormalBalance

    def __post_init__(self) -> None:
        if self.amount_kurus <= 0:
            raise OpeningBalanceError("amount_kurus must be positive")
        if self.side not in (AccountNormalBalance.DEBIT, AccountNormalBalance.CREDIT):
            raise OpeningBalanceError("side must be debit or credit")


@dataclass(frozen=True, slots=True)
class JournalLineDraft:
    account_code: str
    amount_kurus: int
    side: AccountNormalBalance


def validate_opening_balance_lines(lines: list[OpeningBalanceLine]) -> None:
    """Each line uses a valid account at its natural balance side."""
    if not lines:
        raise OpeningBalanceError("at least one opening balance line is required")

    chart = chart_by_code()
    allowed = {a.code for a in opening_balance_accounts()}
    seen_accounts: set[str] = set()

    for line in lines:
        if line.account_code in seen_accounts:
            raise OpeningBalanceError(f"duplicate account in opening balances: {line.account_code}")
        seen_accounts.add(line.account_code)

        account = chart.get(line.account_code)
        if account is None:
            raise OpeningBalanceError(f"unknown account code: {line.account_code}")
        if line.account_code not in allowed:
            raise OpeningBalanceError(
                f"account {line.account_code} does not accept opening balances"
            )
        if line.side != account.normal_balance:
            raise OpeningBalanceError(
                f"account {line.account_code} opening side must be {account.normal_balance.value}"
            )


def build_day_one_journal(lines: list[OpeningBalanceLine]) -> list[JournalLineDraft]:
    """Build balanced day-one journal; offset posts to Opening Balance Equity (Decisions §19)."""
    validate_opening_balance_lines(lines)

    journal: list[JournalLineDraft] = [
        JournalLineDraft(
            account_code=line.account_code,
            amount_kurus=line.amount_kurus,
            side=line.side,
        )
        for line in lines
    ]

    debits = sum(l.amount_kurus for l in lines if l.side == AccountNormalBalance.DEBIT)
    credits = sum(l.amount_kurus for l in lines if l.side == AccountNormalBalance.CREDIT)
    equity_amount = debits - credits

    if equity_amount > 0:
        journal.append(
            JournalLineDraft(
                account_code=OPENING_BALANCE_EQUITY_CODE,
                amount_kurus=equity_amount,
                side=AccountNormalBalance.CREDIT,
            )
        )
    elif equity_amount < 0:
        journal.append(
            JournalLineDraft(
                account_code=OPENING_BALANCE_EQUITY_CODE,
                amount_kurus=-equity_amount,
                side=AccountNormalBalance.DEBIT,
            )
        )

    total_debits = sum(l.amount_kurus for l in journal if l.side == AccountNormalBalance.DEBIT)
    total_credits = sum(l.amount_kurus for l in journal if l.side == AccountNormalBalance.CREDIT)
    if total_debits != total_credits:
        raise OpeningBalanceError("generated journal does not balance")

    return journal
