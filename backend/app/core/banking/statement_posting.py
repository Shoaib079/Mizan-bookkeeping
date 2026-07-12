"""Bank statement event GL posting — bank fees and credit card payments (Decisions §12)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import BANK_CHARGES_CODE, LOANS_PAYABLE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.db.session import entity_context, require_entity_context
from app.features.banking.credit_card_payment_models import CreditCardPayment
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.entities import service as entity_service


class InvalidBankStatementPostError(ValueError):
    """Bank fee or credit card payment preconditions failed."""


@dataclass(frozen=True, slots=True)
class BankFeePostResult:
    journal_entry: JournalEntry


@dataclass(frozen=True, slots=True)
class CreditCardPaymentPostResult:
    journal_entry: JournalEntry
    credit_card_payment: CreditCardPayment


def build_bank_fee_posting_lines(
    *,
    bank_gl_account_id: uuid.UUID,
    bank_charges_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit bank charges expense, credit bank asset."""
    if amount_kurus <= 0:
        raise ValueError("bank charges amount must be positive kuruş")

    return [
        PostingLine(
            account_id=bank_charges_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=bank_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_credit_card_payment_posting_lines(
    *,
    credit_card_gl_account_id: uuid.UUID,
    bank_gl_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit CC payable (reduce liability), credit bank — not an expense."""
    if amount_kurus <= 0:
        raise ValueError("credit card payment amount must be positive kuruş")

    return [
        PostingLine(
            account_id=credit_card_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=bank_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def _validate_bank_gl_account(
    session: Session, entity_id: uuid.UUID, account_id: uuid.UUID
) -> Account:
    account = session.get(Account, account_id)
    if account is None or account.entity_id != entity_id:
        raise InvalidAccountError("GL account not found for this entity")
    if not account.is_active:
        raise InvalidAccountError(f"account {account.code} is not active")
    if account.account_type != AccountType.ASSET:
        raise InvalidAccountError(
            f"account {account.code} is not an asset (bank/cash) account"
        )
    return account


def _validate_liability_gl_account(
    session: Session, entity_id: uuid.UUID, account_id: uuid.UUID
) -> Account:
    account = session.get(Account, account_id)
    if account is None or account.entity_id != entity_id:
        raise InvalidAccountError("GL account not found for this entity")
    if not account.is_active:
        raise InvalidAccountError(f"account {account.code} is not active")
    if account.account_type != AccountType.LIABILITY:
        raise InvalidAccountError(
            f"account {account.code} is not a liability (credit card payable) account"
        )
    return account


def _validate_bank_money_account(
    session: Session, entity_id: uuid.UUID, money_account_id: uuid.UUID
) -> MoneyAccount:
    money_account = session.get(MoneyAccount, money_account_id)
    if money_account is None or money_account.entity_id != entity_id:
        raise InvalidBankStatementPostError("Bank money account not found for this entity")
    if not money_account.is_active:
        raise InvalidBankStatementPostError("Bank money account is not active")
    if money_account.account_kind != MoneyAccountKind.BANK:
        raise InvalidBankStatementPostError("Bank charges and card payments require a bank account")
    return money_account


def _validate_credit_card_money_account(
    session: Session, entity_id: uuid.UUID, money_account_id: uuid.UUID
) -> MoneyAccount:
    money_account = session.get(MoneyAccount, money_account_id)
    if money_account is None or money_account.entity_id != entity_id:
        raise InvalidBankStatementPostError("Credit card money account not found for this entity")
    if not money_account.is_active:
        raise InvalidBankStatementPostError("Credit card money account is not active")
    if money_account.account_kind != MoneyAccountKind.CREDIT_CARD:
        raise InvalidBankStatementPostError(
            "credit_card_payment requires a credit_card money account"
        )
    return money_account


def persist_credit_card_payment(
    session: Session,
    *,
    credit_card_money_account_id: uuid.UUID,
    bank_money_account_id: uuid.UUID,
    payment_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    bank_statement_line_id: uuid.UUID | None = None,
) -> CreditCardPayment:
    payment = CreditCardPayment(
        credit_card_money_account_id=credit_card_money_account_id,
        bank_money_account_id=bank_money_account_id,
        payment_date=payment_date,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
        journal_entry_id=journal_entry_id,
        bank_statement_line_id=bank_statement_line_id,
    )
    session.add(payment)
    session.flush()
    session.refresh(payment)
    return payment


def post_bank_fee(
    session: Session,
    entity_id: uuid.UUID,
    *,
    bank_money_account_id: uuid.UUID,
    fee_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    source: JournalEntrySource = JournalEntrySource.BANK_FEE,
    charges_account_code: str = BANK_CHARGES_CODE,
) -> BankFeePostResult:
    """Post a money-out bank charge: Dr expense (default 5300 Bank Charges), Cr bank.

    Pass charges_account_code to route card commission to 5310 instead of 5300.
    """
    if amount_kurus <= 0:
        raise ValueError("Bank charges amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        bank_account = _validate_bank_money_account(session, entity_id, bank_money_account_id)
        _validate_bank_gl_account(session, entity_id, bank_account.gl_account_id)

        bank_charges = session.scalar(
            select(Account).where(Account.code == charges_account_code)
        )
        if bank_charges is None:
            raise InvalidAccountError(f"charges account {charges_account_code} not found")

        lines = build_bank_fee_posting_lines(
            bank_gl_account_id=bank_account.gl_account_id,
            bank_charges_account_id=bank_charges.id,
            amount_kurus=amount_kurus,
        )

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            fee_date,
            description,
            lines,
            actor_id=actor_id,
            source=source,
        )

        session.commit()
        session.refresh(journal_entry)
        _ = list(journal_entry.lines)

        return BankFeePostResult(journal_entry=journal_entry)


def post_credit_card_payment(
    session: Session,
    entity_id: uuid.UUID,
    *,
    credit_card_money_account_id: uuid.UUID,
    bank_money_account_id: uuid.UUID,
    payment_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    bank_statement_line_id: uuid.UUID | None = None,
) -> CreditCardPaymentPostResult:
    """Post company credit card payment: Dr CC payable, Cr bank — reduces liability, not expense."""
    if amount_kurus <= 0:
        raise ValueError("Credit card payment amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        card_account = _validate_credit_card_money_account(
            session, entity_id, credit_card_money_account_id
        )
        bank_account = _validate_bank_money_account(session, entity_id, bank_money_account_id)
        _validate_liability_gl_account(session, entity_id, card_account.gl_account_id)
        _validate_bank_gl_account(session, entity_id, bank_account.gl_account_id)

        lines = build_credit_card_payment_posting_lines(
            credit_card_gl_account_id=card_account.gl_account_id,
            bank_gl_account_id=bank_account.gl_account_id,
            amount_kurus=amount_kurus,
        )

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            payment_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.CREDIT_CARD_PAYMENT,
        )

        payment = persist_credit_card_payment(
            session,
            credit_card_money_account_id=credit_card_money_account_id,
            bank_money_account_id=bank_money_account_id,
            payment_date=payment_date,
            amount_kurus=amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
            bank_statement_line_id=bank_statement_line_id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(payment)
        _ = list(journal_entry.lines)

        return CreditCardPaymentPostResult(
            journal_entry=journal_entry,
            credit_card_payment=payment,
        )


@dataclass(frozen=True, slots=True)
class LoanMovementPostResult:
    journal_entry: JournalEntry


def build_loan_payment_lines(
    *,
    loans_payable_account_id: uuid.UUID,
    bank_gl_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit loans payable, credit bank."""
    if amount_kurus <= 0:
        raise ValueError("loan payment amount must be positive kuruş")
    return [
        PostingLine(
            account_id=loans_payable_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=bank_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_loan_receipt_lines(
    *,
    bank_gl_account_id: uuid.UUID,
    loans_payable_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit bank, credit loans payable (loan proceeds received)."""
    if amount_kurus <= 0:
        raise ValueError("loan receipt amount must be positive kuruş")
    return [
        PostingLine(
            account_id=bank_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=loans_payable_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def _chart_account_by_code(session: Session, entity_id: uuid.UUID, code: str) -> Account:
    account = session.scalar(
        select(Account).where(Account.entity_id == entity_id, Account.code == code)
    )
    if account is None:
        raise InvalidAccountError(f"chart account {code} not found")
    return account


def post_loan_payment(
    session: Session,
    entity_id: uuid.UUID,
    *,
    bank_money_account_id: uuid.UUID,
    payment_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
) -> LoanMovementPostResult:
    """Repay bank loan from this account — Dr 2200 / Cr bank."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        bank_account = _validate_bank_money_account(session, entity_id, bank_money_account_id)
        loans = _chart_account_by_code(session, entity_id, LOANS_PAYABLE_CODE)
        _validate_liability_gl_account(session, entity_id, loans.id)
        _validate_bank_gl_account(session, entity_id, bank_account.gl_account_id)

        lines = build_loan_payment_lines(
            loans_payable_account_id=loans.id,
            bank_gl_account_id=bank_account.gl_account_id,
            amount_kurus=amount_kurus,
        )
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            payment_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.PAYMENT,
        )
        session.commit()
        session.refresh(journal_entry)
        _ = list(journal_entry.lines)
        return LoanMovementPostResult(journal_entry=journal_entry)


def post_loan_receipt(
    session: Session,
    entity_id: uuid.UUID,
    *,
    bank_money_account_id: uuid.UUID,
    receipt_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
) -> LoanMovementPostResult:
    """Loan proceeds deposited — Dr bank / Cr 2200."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        bank_account = _validate_bank_money_account(session, entity_id, bank_money_account_id)
        loans = _chart_account_by_code(session, entity_id, LOANS_PAYABLE_CODE)
        _validate_liability_gl_account(session, entity_id, loans.id)
        _validate_bank_gl_account(session, entity_id, bank_account.gl_account_id)

        lines = build_loan_receipt_lines(
            bank_gl_account_id=bank_account.gl_account_id,
            loans_payable_account_id=loans.id,
            amount_kurus=amount_kurus,
        )
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            receipt_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.PAYMENT,
        )
        session.commit()
        session.refresh(journal_entry)
        _ = list(journal_entry.lines)
        return LoanMovementPostResult(journal_entry=journal_entry)
