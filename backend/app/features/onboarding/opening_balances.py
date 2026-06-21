"""Opening balance validation and day-one journal drafts (Decisions §19)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_PAYABLE_CODE,
    OPENING_BALANCE_EQUITY_CODE,
    PARTNER_REIMBURSEMENT_PAYABLE_CODE,
    chart_by_code,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.suppliers.models import Supplier

# FX wallets — require quantity + TRY cost model (docs/OPENING_BALANCES.md § Gaps)
FX_WALLET_CODES = frozenset({"1010", "1020", "1030"})

BANK_BUCKET_CODE = "1100"
CASH_BUCKET_CODE = "1000"
CREDIT_CARD_BUCKET_CODE = "2100"

# Aggregate-only codes allowed when no per-bank/cash/credit-card sub-accounts exist
ALLOWED_AGGREGATE_OB_CODES = frozenset(
    {
        "1000",  # TRY cash (aggregate when no cash sub-accounts)
        "1100",  # bank TRY (aggregate when no bank sub-accounts)
        "1200",  # receivables (aggregate)
        "1300",  # employee advances (aggregate until Phase 5 per-employee)
        "1400",  # card sales clearing
        "2000",  # supplier AP (aggregate when no per-supplier lines)
        "2100",  # credit card payable (aggregate when no credit card sub-accounts)
        "2200",  # loans
    }
)


class OpeningBalanceError(ValueError):
    """Opening balance set fails validation."""


class OpeningBalanceNotSupportedError(OpeningBalanceError):
    """Category not modeled yet — block, don't guess."""


@dataclass(frozen=True, slots=True)
class OpeningBalanceLine:
    """Aggregate account line — explicit side (legacy pure tests)."""

    account_code: str
    amount_kurus: int
    side: AccountNormalBalance

    def __post_init__(self) -> None:
        if self.amount_kurus <= 0:
            raise OpeningBalanceError("amount_kurus must be positive")
        if self.side not in (AccountNormalBalance.DEBIT, AccountNormalBalance.CREDIT):
            raise OpeningBalanceError("side must be debit or credit")


@dataclass(frozen=True, slots=True)
class OpeningBalanceLineInput:
    """One opening balance target — exactly one of code, money account, or supplier."""

    amount_kurus: int
    account_code: str | None = None
    money_account_id: uuid.UUID | None = None
    supplier_id: uuid.UUID | None = None
    side: AccountNormalBalance | None = None

    def __post_init__(self) -> None:
        if self.amount_kurus <= 0:
            raise OpeningBalanceError("amount_kurus must be positive")
        targets = [self.account_code, self.money_account_id, self.supplier_id]
        set_count = sum(1 for target in targets if target is not None)
        if set_count != 1:
            raise OpeningBalanceError(
                "each line must specify exactly one of account_code, "
                "money_account_id, or supplier_id"
            )
        if self.account_code is not None and self.side is None:
            raise OpeningBalanceError("side is required for account_code lines")
        if self.account_code is None and self.side is not None:
            raise OpeningBalanceError(
                "side is implied for money_account_id and supplier_id lines"
            )


@dataclass(frozen=True, slots=True)
class JournalLineDraft:
    account_code: str
    account_id: uuid.UUID | None
    amount_kurus: int
    side: AccountNormalBalance


@dataclass(frozen=True, slots=True)
class SupplierOpeningLine:
    supplier_id: uuid.UUID
    amount_kurus: int


def line_input_from_aggregate(line: OpeningBalanceLine) -> OpeningBalanceLineInput:
    return OpeningBalanceLineInput(
        account_code=line.account_code,
        amount_kurus=line.amount_kurus,
        side=line.side,
    )


def _reject_unmodeled_account_code(account_code: str) -> None:
    if account_code in FX_WALLET_CODES:
        raise OpeningBalanceNotSupportedError(
            "FX wallet opening balances are not supported yet. "
            "Requires quantity in native minor units plus owner-entered TRY cost at "
            "opening (never a live rate). See docs/OPENING_BALANCES.md."
        )
    if account_code == PARTNER_REIMBURSEMENT_PAYABLE_CODE:
        raise OpeningBalanceNotSupportedError(
            "Partner reimbursement opening balances are not supported yet (Phase 5). "
            "Use account 2150 only after per-partner sub-ledger is implemented. "
            "Never post partner balances to supplier AP (2000)."
        )
    if account_code == OPENING_BALANCE_EQUITY_CODE:
        raise OpeningBalanceNotSupportedError(
            f"account {account_code}: opening balance not supported yet. "
            "Opening Balance Equity is added automatically as the offset."
        )


def _validate_aggregate_line(line: OpeningBalanceLineInput) -> None:
    assert line.account_code is not None
    assert line.side is not None

    _reject_unmodeled_account_code(line.account_code)

    chart = chart_by_code()
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


def _active_money_account_kinds(session: Session) -> set[MoneyAccountKind]:
    rows = session.scalars(
        select(MoneyAccount.account_kind).where(MoneyAccount.is_active.is_(True))
    ).all()
    return set(rows)


def _validate_opening_balance_lines_in_context(
    session: Session,
    lines: list[OpeningBalanceLineInput],
) -> None:
    """Validate lines — caller must hold entity_context."""
    if not lines:
        raise OpeningBalanceError("at least one opening balance line is required")

    require_entity_context()

    active_kinds = _active_money_account_kinds(session)
    has_bank_sub_accounts = MoneyAccountKind.BANK in active_kinds
    has_cash_sub_accounts = MoneyAccountKind.CASH in active_kinds
    has_credit_card_sub_accounts = MoneyAccountKind.CREDIT_CARD in active_kinds
    has_fx_sub_accounts = MoneyAccountKind.FOREIGN_CURRENCY in active_kinds

    seen_account_codes: set[str] = set()
    seen_money_accounts: set[uuid.UUID] = set()
    seen_suppliers: set[uuid.UUID] = set()
    has_supplier_lines = False

    for line in lines:
        if line.account_code is not None:
            if line.account_code in seen_account_codes:
                raise OpeningBalanceError(
                    f"duplicate account in opening balances: {line.account_code}"
                )
            seen_account_codes.add(line.account_code)

            if line.account_code == BANK_BUCKET_CODE and has_bank_sub_accounts:
                raise OpeningBalanceError(
                    "aggregate account 1100 is not allowed when bank sub-accounts exist; "
                    "use money_account_id for each bank balance"
                )
            if line.account_code == CASH_BUCKET_CODE and has_cash_sub_accounts:
                raise OpeningBalanceError(
                    "aggregate account 1000 is not allowed when cash sub-accounts exist; "
                    "use money_account_id for each cash balance"
                )
            if line.account_code == CREDIT_CARD_BUCKET_CODE and has_credit_card_sub_accounts:
                raise OpeningBalanceError(
                    "aggregate account 2100 is not allowed when credit card sub-accounts exist; "
                    "use money_account_id for each credit card balance"
                )
            if line.account_code in FX_WALLET_CODES and has_fx_sub_accounts:
                raise OpeningBalanceError(
                    f"aggregate account {line.account_code} is not allowed when FX sub-accounts exist; "
                    "use money_account_id with quantity model (not supported yet)"
                )
            if line.account_code == ACCOUNTS_PAYABLE_CODE and any(
                other.supplier_id is not None for other in lines
            ):
                raise OpeningBalanceError(
                    "aggregate account 2000 cannot be combined with supplier_id lines; "
                    "use supplier_id for each supplier payable balance"
                )

            _validate_aggregate_line(line)

        elif line.money_account_id is not None:
            if line.money_account_id in seen_money_accounts:
                raise OpeningBalanceError(
                    f"duplicate money account in opening balances: {line.money_account_id}"
                )
            seen_money_accounts.add(line.money_account_id)

            money_account = session.get(MoneyAccount, line.money_account_id)
            if money_account is None or not money_account.is_active:
                raise OpeningBalanceError(
                    f"money account not found or inactive: {line.money_account_id}"
                )
            if money_account.account_kind == MoneyAccountKind.FOREIGN_CURRENCY:
                raise OpeningBalanceNotSupportedError(
                    "FX wallet opening balances require quantity + TRY cost model — not supported yet"
                )

        else:
            assert line.supplier_id is not None
            if line.supplier_id in seen_suppliers:
                raise OpeningBalanceError(
                    f"duplicate supplier in opening balances: {line.supplier_id}"
                )
            seen_suppliers.add(line.supplier_id)
            has_supplier_lines = True

            supplier = session.get(Supplier, line.supplier_id)
            if supplier is None:
                raise OpeningBalanceError(f"supplier not found: {line.supplier_id}")

    if has_supplier_lines and ACCOUNTS_PAYABLE_CODE in seen_account_codes:
        raise OpeningBalanceError(
            "aggregate account 2000 cannot be combined with supplier_id lines"
        )


def validate_opening_balance_lines(
    session: Session,
    entity_id: uuid.UUID,
    lines: list[OpeningBalanceLineInput],
) -> None:
    """Validate opening balance lines for one entity — aggregate, bank/cash, supplier."""
    with entity_context(session, entity_id):
        _validate_opening_balance_lines_in_context(session, lines)


def _resolve_journal_lines(
    session: Session,
    lines: list[OpeningBalanceLineInput],
) -> tuple[list[JournalLineDraft], list[SupplierOpeningLine]]:
    """Map validated input lines to GL journal drafts and supplier subledger targets."""
    journal: list[JournalLineDraft] = []
    supplier_lines: list[SupplierOpeningLine] = []
    supplier_total = 0

    for line in lines:
        if line.account_code is not None:
            account = session.scalar(
                select(Account).where(Account.code == line.account_code)
            )
            if account is None:
                raise OpeningBalanceError(f"account {line.account_code} not seeded for entity")
            assert line.side is not None
            journal.append(
                JournalLineDraft(
                    account_code=account.code,
                    account_id=account.id,
                    amount_kurus=line.amount_kurus,
                    side=line.side,
                )
            )
        elif line.money_account_id is not None:
            money_account = session.get(MoneyAccount, line.money_account_id)
            assert money_account is not None
            gl_account = session.get(Account, money_account.gl_account_id)
            if gl_account is None:
                raise OpeningBalanceError(
                    f"GL account missing for money account {line.money_account_id}"
                )
            journal.append(
                JournalLineDraft(
                    account_code=gl_account.code,
                    account_id=gl_account.id,
                    amount_kurus=line.amount_kurus,
                    side=gl_account.normal_balance,
                )
            )
        else:
            assert line.supplier_id is not None
            supplier_lines.append(
                SupplierOpeningLine(
                    supplier_id=line.supplier_id,
                    amount_kurus=line.amount_kurus,
                )
            )
            supplier_total += line.amount_kurus

    if supplier_total > 0:
        ap_account = session.scalar(
            select(Account).where(Account.code == ACCOUNTS_PAYABLE_CODE)
        )
        if ap_account is None:
            raise OpeningBalanceError(
                f"accounts payable account {ACCOUNTS_PAYABLE_CODE} not seeded for entity"
            )
        journal.append(
            JournalLineDraft(
                account_code=ap_account.code,
                account_id=ap_account.id,
                amount_kurus=supplier_total,
                side=AccountNormalBalance.CREDIT,
            )
        )

    return journal, supplier_lines


def _build_day_one_journal_in_context(
    session: Session,
    lines: list[OpeningBalanceLineInput],
) -> list[JournalLineDraft]:
    """Build balanced day-one journal — caller must hold entity_context."""
    _validate_opening_balance_lines_in_context(session, lines)
    require_entity_context()

    journal, _ = _resolve_journal_lines(session, lines)

    debits = sum(
        line.amount_kurus for line in journal if line.side == AccountNormalBalance.DEBIT
    )
    credits = sum(
        line.amount_kurus for line in journal if line.side == AccountNormalBalance.CREDIT
    )
    equity_amount = debits - credits

    equity_account = session.scalar(
        select(Account).where(Account.code == OPENING_BALANCE_EQUITY_CODE)
    )
    if equity_account is None:
        raise OpeningBalanceError(
            f"opening balance equity account {OPENING_BALANCE_EQUITY_CODE} not seeded"
        )

    if equity_amount > 0:
        journal.append(
            JournalLineDraft(
                account_code=OPENING_BALANCE_EQUITY_CODE,
                account_id=equity_account.id,
                amount_kurus=equity_amount,
                side=AccountNormalBalance.CREDIT,
            )
        )
    elif equity_amount < 0:
        journal.append(
            JournalLineDraft(
                account_code=OPENING_BALANCE_EQUITY_CODE,
                account_id=equity_account.id,
                amount_kurus=-equity_amount,
                side=AccountNormalBalance.DEBIT,
            )
        )

    total_debits = sum(
        line.amount_kurus for line in journal if line.side == AccountNormalBalance.DEBIT
    )
    total_credits = sum(
        line.amount_kurus for line in journal if line.side == AccountNormalBalance.CREDIT
    )
    if total_debits != total_credits:
        raise OpeningBalanceError("generated journal does not balance")

    return journal


def build_day_one_journal(
    session: Session,
    entity_id: uuid.UUID,
    lines: list[OpeningBalanceLineInput],
) -> list[JournalLineDraft]:
    """Build balanced day-one journal; offset posts to Opening Balance Equity (Decisions §19)."""
    with entity_context(session, entity_id):
        return _build_day_one_journal_in_context(session, lines)


def build_day_one_journal_aggregate(
    lines: list[OpeningBalanceLine],
) -> list[JournalLineDraft]:
    """Pure aggregate-only journal builder for unit tests without DB."""
    inputs = [line_input_from_aggregate(line) for line in lines]
    for line in inputs:
        _validate_aggregate_line(line)

    journal: list[JournalLineDraft] = [
        JournalLineDraft(
            account_code=line.account_code,
            account_id=None,
            amount_kurus=line.amount_kurus,
            side=line.side,
        )
        for line in inputs
        if line.account_code is not None and line.side is not None
    ]

    debits = sum(
        line.amount_kurus for line in inputs if line.side == AccountNormalBalance.DEBIT
    )
    credits = sum(
        line.amount_kurus for line in inputs if line.side == AccountNormalBalance.CREDIT
    )
    equity_amount = debits - credits

    if equity_amount > 0:
        journal.append(
            JournalLineDraft(
                account_code=OPENING_BALANCE_EQUITY_CODE,
                account_id=None,
                amount_kurus=equity_amount,
                side=AccountNormalBalance.CREDIT,
            )
        )
    elif equity_amount < 0:
        journal.append(
            JournalLineDraft(
                account_code=OPENING_BALANCE_EQUITY_CODE,
                account_id=None,
                amount_kurus=-equity_amount,
                side=AccountNormalBalance.DEBIT,
            )
        )

    total_debits = sum(
        line.amount_kurus for line in journal if line.side == AccountNormalBalance.DEBIT
    )
    total_credits = sum(
        line.amount_kurus for line in journal if line.side == AccountNormalBalance.CREDIT
    )
    if total_debits != total_credits:
        raise OpeningBalanceError("generated journal does not balance")

    return journal


def resolve_opening_balance_posting(
    session: Session,
    entity_id: uuid.UUID,
    lines: list[OpeningBalanceLineInput],
) -> tuple[list[JournalLineDraft], list[SupplierOpeningLine]]:
    """Validated journal drafts plus supplier subledger lines — caller holds entity_context."""
    journal = _build_day_one_journal_in_context(session, lines)
    _, supplier_lines = _resolve_journal_lines(session, lines)
    return journal, supplier_lines


def chart_is_seeded(session: Session, entity_id: uuid.UUID) -> bool:
    with entity_context(session, entity_id):
        count = session.scalar(select(func.count()).select_from(Account)) or 0
        return int(count) > 0
