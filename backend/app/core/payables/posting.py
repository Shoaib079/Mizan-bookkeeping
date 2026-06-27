"""Supplier payment → GL + payables subledger (Decisions §8, §11)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_PAYABLE_CODE,
    OPENING_BALANCE_EQUITY_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.core.payables.ledger import OverpaymentError, current_balance_kurus
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.suppliers.models import Supplier


@dataclass(frozen=True, slots=True)
class SupplierPaymentPostResult:
    journal_entry: JournalEntry
    supplier_ledger_entry: SupplierLedgerEntry
    payable_balance_kurus: int


@dataclass(frozen=True, slots=True)
class SupplierManualMovementPostResult:
    journal_entry: JournalEntry
    supplier_ledger_entry: SupplierLedgerEntry
    payable_balance_kurus: int


def build_supplier_payment_posting_lines(
    *,
    ap_account_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit AP, credit bank/cash for payment amount."""
    if amount_kurus <= 0:
        raise ValueError("payment amount must be positive kuruş")

    return [
        PostingLine(
            account_id=ap_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=payment_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_supplier_ap_adjustment_lines(
    *,
    ap_account_id: uuid.UUID,
    offset_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """Signed amount — positive increases AP (Cr AP), negative decreases AP (Dr AP)."""
    if amount_kurus == 0:
        raise ValueError("adjustment amount_kurus must be non-zero")

    abs_amount = abs(amount_kurus)
    if amount_kurus > 0:
        return [
            PostingLine(
                account_id=offset_account_id,
                amount_kurus=abs_amount,
                side=AccountNormalBalance.DEBIT,
            ),
            PostingLine(
                account_id=ap_account_id,
                amount_kurus=abs_amount,
                side=AccountNormalBalance.CREDIT,
            ),
        ]
    return [
        PostingLine(
            account_id=ap_account_id,
            amount_kurus=abs_amount,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=offset_account_id,
            amount_kurus=abs_amount,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def _chart_account(session: Session, code: str) -> Account:
    account = session.scalar(select(Account).where(Account.code == code))
    if account is None:
        raise InvalidAccountError(f"chart account {code} not found")
    if not account.is_active:
        raise InvalidAccountError(f"account {code} is not active")
    return account


def persist_supplier_manual_entry(
    session: Session,
    supplier_id: uuid.UUID,
    *,
    movement_date: date,
    movement_type: SupplierMovementType,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
) -> SupplierLedgerEntry:
    """Persist adjustment/opening payables movement — caller must hold entity_context."""
    if amount_kurus == 0:
        raise ValueError("amount_kurus must be non-zero")

    supplier = session.get(Supplier, supplier_id)
    if supplier is None:
        raise LookupError("Supplier not found")

    entry = SupplierLedgerEntry(
        supplier_id=supplier_id,
        movement_date=movement_date,
        movement_type=movement_type,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
        journal_entry_id=journal_entry_id,
    )
    session.add(entry)
    session.flush()
    session.refresh(entry)
    return entry


def post_supplier_manual_movement(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    *,
    movement_date: date,
    movement_type: SupplierMovementType,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
) -> SupplierManualMovementPostResult:
    """Post AP adjustment or per-supplier opening balance with GL counterpart."""
    if movement_type not in {
        SupplierMovementType.ADJUSTMENT,
        SupplierMovementType.OPENING_BALANCE,
    }:
        raise ValueError(f"unsupported manual movement type {movement_type.value!r}")
    if amount_kurus == 0:
        raise ValueError("amount_kurus must be non-zero")
    if movement_type == SupplierMovementType.OPENING_BALANCE and amount_kurus <= 0:
        raise ValueError("opening balance amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        supplier = session.get(Supplier, supplier_id)
        if supplier is None:
            raise LookupError("Supplier not found")

        ap_account = _chart_account(session, ACCOUNTS_PAYABLE_CODE)
        offset_account = _chart_account(session, OPENING_BALANCE_EQUITY_CODE)
        lines = build_supplier_ap_adjustment_lines(
            ap_account_id=ap_account.id,
            offset_account_id=offset_account.id,
            amount_kurus=amount_kurus,
        )
        source = (
            JournalEntrySource.OPENING_BALANCE
            if movement_type == SupplierMovementType.OPENING_BALANCE
            else JournalEntrySource.MANUAL
        )
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            movement_date,
            description,
            lines,
            actor_id=actor_id,
            source=source,
        )
        supplier_entry = persist_supplier_manual_entry(
            session,
            supplier_id,
            movement_date=movement_date,
            movement_type=movement_type,
            amount_kurus=amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )
        session.commit()
        session.refresh(journal_entry)
        session.refresh(supplier_entry)
        _ = list(journal_entry.lines)

        balance = session.scalar(
            select(func.coalesce(func.sum(SupplierLedgerEntry.amount_kurus), 0)).where(
                SupplierLedgerEntry.supplier_id == supplier_id
            )
        )
        return SupplierManualMovementPostResult(
            journal_entry=journal_entry,
            supplier_ledger_entry=supplier_entry,
            payable_balance_kurus=int(balance or 0),
        )


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


def persist_supplier_payment_entry(
    session: Session,
    supplier_id: uuid.UUID,
    *,
    movement_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> SupplierLedgerEntry:
    """Persist payment payables movement without commit — caller must hold entity_context."""
    if amount_kurus >= 0:
        raise ValueError("payment amount_kurus must be negative on subledger")

    supplier = session.get(Supplier, supplier_id)
    if supplier is None:
        raise LookupError("Supplier not found")

    entry = SupplierLedgerEntry(
        supplier_id=supplier_id,
        movement_date=movement_date,
        movement_type=SupplierMovementType.PAYMENT,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
        journal_entry_id=journal_entry_id,
        reference_type=reference_type,
        reference_id=reference_id,
    )
    session.add(entry)
    session.flush()
    session.refresh(entry)
    return entry


def post_supplier_payment(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    *,
    payment_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
    source: JournalEntrySource = JournalEntrySource.PAYMENT,
) -> SupplierPaymentPostResult:
    """Post supplier payment to GL and payables subledger in one transaction."""
    if amount_kurus <= 0:
        raise ValueError("Payment amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    current = current_balance_kurus(session, entity_id, supplier_id)
    if current - amount_kurus < 0:
        raise OverpaymentError(
            f"Payment of {amount_kurus} kuruş exceeds payable balance of {current} kuruş"
        )

    with entity_context(session, entity_id):
        require_entity_context()

        _validate_payment_account(session, entity_id, payment_account_id)

        ap_account = session.scalar(
            select(Account).where(Account.code == ACCOUNTS_PAYABLE_CODE)
        )
        if ap_account is None:
            raise InvalidAccountError(
                f"accounts payable account {ACCOUNTS_PAYABLE_CODE} not found"
            )

        lines = build_supplier_payment_posting_lines(
            ap_account_id=ap_account.id,
            payment_account_id=payment_account_id,
            amount_kurus=amount_kurus,
        )

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            payment_date,
            description,
            lines,
            actor_id=actor_id,
            source=source,
        )

        supplier_entry = persist_supplier_payment_entry(
            session,
            supplier_id,
            movement_date=payment_date,
            amount_kurus=-amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
            reference_type=reference_type,
            reference_id=reference_id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(supplier_entry)
        _ = list(journal_entry.lines)

        balance = session.scalar(
            select(func.coalesce(func.sum(SupplierLedgerEntry.amount_kurus), 0)).where(
                SupplierLedgerEntry.supplier_id == supplier_id
            )
        )
        return SupplierPaymentPostResult(
            journal_entry=journal_entry,
            supplier_ledger_entry=supplier_entry,
            payable_balance_kurus=int(balance or 0),
        )
