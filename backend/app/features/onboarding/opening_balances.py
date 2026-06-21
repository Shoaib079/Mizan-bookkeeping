"""Opening balance validation — day-one journal drafts (Decisions §19). Phase 1 posts via core/ledger."""

from __future__ import annotations

from dataclasses import dataclass

from app.core.chart_of_accounts.default_chart import (
    OPENING_BALANCE_EQUITY_CODE,
    PARTNER_REIMBURSEMENT_PAYABLE_CODE,
    chart_by_code,
)
from app.core.chart_of_accounts.types import AccountNormalBalance

# FX wallets — require quantity + TRY cost model (docs/OPENING_BALANCES.md § Gaps)
FX_WALLET_CODES = frozenset({"1010", "1020", "1030"})

# Aggregate-only codes allowed by validate API until sub-account models exist
ALLOWED_AGGREGATE_OB_CODES = frozenset(
    {
        "1000",  # TRY cash
        "1100",  # bank TRY (aggregate until Phase 3 per-bank)
        "1200",  # receivables (aggregate)
        "1300",  # employee advances (aggregate until Phase 5 per-employee)
        "1400",  # card sales clearing
        "2000",  # supplier AP (aggregate until Phase 2 per-supplier)
        "2100",  # credit card payable (aggregate until Phase 3 per-card)
        "2200",  # loans
    }
)


class OpeningBalanceError(ValueError):
    """Opening balance set fails validation."""


class OpeningBalanceNotSupportedError(OpeningBalanceError):
    """Category not modeled yet — block, don't guess."""


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


def _reject_unmodeled_category(line: OpeningBalanceLine) -> None:
    if line.account_code in FX_WALLET_CODES:
        raise OpeningBalanceNotSupportedError(
            "FX wallet opening balances are not supported yet. "
            "Requires quantity in native minor units plus owner-entered TRY cost at "
            "opening (never a live rate). See docs/OPENING_BALANCES.md."
        )
    if line.account_code == PARTNER_REIMBURSEMENT_PAYABLE_CODE:
        raise OpeningBalanceNotSupportedError(
            "Partner reimbursement opening balances are not supported yet (Phase 5). "
            "Use account 2150 only after per-partner sub-ledger is implemented. "
            "Never post partner balances to supplier AP (2000)."
        )


def validate_opening_balance_lines(lines: list[OpeningBalanceLine]) -> None:
    """Each line uses an aggregate account allowed today; block unmodeled categories."""
    if not lines:
        raise OpeningBalanceError("at least one opening balance line is required")

    chart = chart_by_code()
    seen_accounts: set[str] = set()

    for line in lines:
        if line.account_code in seen_accounts:
            raise OpeningBalanceError(f"duplicate account in opening balances: {line.account_code}")
        seen_accounts.add(line.account_code)

        _reject_unmodeled_category(line)

        account = chart.get(line.account_code)
        if account is None:
            raise OpeningBalanceError(f"unknown account code: {line.account_code}")

        if line.account_code not in ALLOWED_AGGREGATE_OB_CODES:
            raise OpeningBalanceNotSupportedError(
                f"account {line.account_code}: opening balance not supported yet. "
                "Per-bank, per-card, per-supplier, and per-staff sub-accounts land in "
                "Phase 3 / Phase 2 / Phase 5. See docs/OPENING_BALANCES.md."
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
