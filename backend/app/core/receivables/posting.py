"""Customer credit sale and payment → GL + receivables subledger (Decisions §10)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_RECEIVABLE_CODE,
    SALES_REVENUE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.core.receivables import ledger as receivables_ledger
from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables.types import CustomerMovementType
from app.db.session import entity_context, require_entity_context
from app.features.customers.models import Customer
from app.features.entities import service as entity_service


class InvalidReceivablePostingError(ValueError):
    """Receivable posting preconditions failed."""


@dataclass(frozen=True, slots=True)
class CreditSalePostResult:
    journal_entry: JournalEntry
    customer_ledger_entry: CustomerLedgerEntry
    balance_kurus: int


@dataclass(frozen=True, slots=True)
class CustomerPaymentPostResult:
    journal_entry: JournalEntry
    customer_ledger_entry: CustomerLedgerEntry
    balance_kurus: int


def _get_customer(session: Session, entity_id: uuid.UUID, customer_id: uuid.UUID) -> Customer:
    customer = session.get(Customer, customer_id)
    if customer is None or customer.entity_id != entity_id:
        raise LookupError("Customer not found")
    return customer


def _chart_account(session: Session, code: str) -> Account:
    account = session.scalar(select(Account).where(Account.code == code))
    if account is None:
        raise InvalidAccountError(f"chart account {code} not found")
    if not account.is_active:
        raise InvalidAccountError(f"account {code} is not active")
    return account


def _validate_revenue_account(
    session: Session, entity_id: uuid.UUID, account_id: uuid.UUID
) -> Account:
    account = session.get(Account, account_id)
    if account is None or account.entity_id != entity_id:
        raise InvalidAccountError("revenue account not found for this entity")
    if not account.is_active:
        raise InvalidAccountError(f"account {account.code} is not active")
    if account.account_type != AccountType.REVENUE:
        raise InvalidAccountError(
            f"account {account.code} is not a revenue account"
        )
    return account


def _validate_payment_account(
    session: Session, entity_id: uuid.UUID, account_id: uuid.UUID
) -> Account:
    account = session.get(Account, account_id)
    if account is None or account.entity_id != entity_id:
        raise InvalidAccountError("payment account not found for this entity")
    if not account.is_active:
        raise InvalidAccountError(f"account {account.code} is not active")
    if account.account_type != AccountType.ASSET:
        raise InvalidAccountError(
            f"account {account.code} is not an asset (bank/cash) account"
        )
    return account


def build_credit_sale_lines(
    *,
    ar_account_id: uuid.UUID,
    revenue_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    if amount_kurus <= 0:
        raise ValueError("credit sale amount must be positive kuruş")

    return [
        PostingLine(
            account_id=ar_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=revenue_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_customer_payment_lines(
    *,
    ar_account_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    if amount_kurus <= 0:
        raise ValueError("payment amount must be positive kuruş")

    return [
        PostingLine(
            account_id=payment_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=ar_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def post_credit_sale(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    *,
    sale_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    revenue_account_id: uuid.UUID | None = None,
) -> CreditSalePostResult:
    """Credit sale — Dr AR / Cr revenue; subledger +amount; revenue recorded once."""
    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_customer(session, entity_id, customer_id)
        ar_account = _chart_account(session, ACCOUNTS_RECEIVABLE_CODE)
        if revenue_account_id is None:
            revenue_gl = _chart_account(session, SALES_REVENUE_CODE)
        else:
            revenue_gl = _validate_revenue_account(session, entity_id, revenue_account_id)

        lines = build_credit_sale_lines(
            ar_account_id=ar_account.id,
            revenue_account_id=revenue_gl.id,
            amount_kurus=amount_kurus,
        )
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            sale_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.CUSTOMER_CREDIT_SALE,
        )

        customer_entry = receivables_ledger.persist_customer_ledger_entry(
            session,
            customer_id,
            movement_date=sale_date,
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(customer_entry)
        _ = list(journal_entry.lines)

        balance = session.scalar(
            select(func.coalesce(func.sum(CustomerLedgerEntry.amount_kurus), 0)).where(
                CustomerLedgerEntry.customer_id == customer_id
            )
        )
        return CreditSalePostResult(
            journal_entry=journal_entry,
            customer_ledger_entry=customer_entry,
            balance_kurus=int(balance or 0),
        )


def post_customer_payment(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    *,
    payment_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> CustomerPaymentPostResult:
    """Customer payment — Dr bank/cash / Cr AR; subledger -amount; no revenue line."""
    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_customer(session, entity_id, customer_id)

        current = receivables_ledger.current_balance_kurus(session, entity_id, customer_id)
        if current - amount_kurus < 0:
            raise receivables_ledger.OverpaymentError(
                f"Payment of {amount_kurus} exceeds receivable balance of {current} kuruş"
            )

        payment_gl = _validate_payment_account(session, entity_id, payment_account_id)
        ar_account = _chart_account(session, ACCOUNTS_RECEIVABLE_CODE)

        lines = build_customer_payment_lines(
            ar_account_id=ar_account.id,
            payment_account_id=payment_gl.id,
            amount_kurus=amount_kurus,
        )
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            payment_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.CUSTOMER_PAYMENT_RECEIVED,
        )

        customer_entry = receivables_ledger.persist_customer_ledger_entry(
            session,
            customer_id,
            movement_date=payment_date,
            movement_type=CustomerMovementType.PAYMENT_RECEIVED,
            amount_kurus=-amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
            reference_type=reference_type,
            reference_id=reference_id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(customer_entry)
        _ = list(journal_entry.lines)

        balance = session.scalar(
            select(func.coalesce(func.sum(CustomerLedgerEntry.amount_kurus), 0)).where(
                CustomerLedgerEntry.customer_id == customer_id
            )
        )
        return CustomerPaymentPostResult(
            journal_entry=journal_entry,
            customer_ledger_entry=customer_entry,
            balance_kurus=int(balance or 0),
        )
