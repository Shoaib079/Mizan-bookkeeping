"""Partner reimbursement GL posting (Decisions §17)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import (
    OWNER_DRAWINGS_CODE,
    PARTNER_REIMBURSEMENT_PAYABLE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.core.partners import ledger as partner_ledger
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.partners.models import Partner


class InvalidPartnerPostingError(ValueError):
    """Partner posting preconditions failed."""


@dataclass(frozen=True, slots=True)
class PartnerExpenseFrontedPostResult:
    journal_entry: JournalEntry
    partner_ledger_entry: PartnerLedgerEntry
    balance_kurus: int


@dataclass(frozen=True, slots=True)
class PartnerReimbursementPaidPostResult:
    journal_entry: JournalEntry
    partner_ledger_entry: PartnerLedgerEntry
    balance_kurus: int


@dataclass(frozen=True, slots=True)
class PartnerDrawingPostResult:
    journal_entry: JournalEntry
    partner_ledger_entry: PartnerLedgerEntry
    balance_kurus: int


@dataclass(frozen=True, slots=True)
class PartnerDrawingRepaymentPostResult:
    journal_entry: JournalEntry
    partner_ledger_entry: PartnerLedgerEntry
    balance_kurus: int


def _get_partner(session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID) -> Partner:
    partner = session.get(Partner, partner_id)
    if partner is None or partner.entity_id != entity_id:
        raise LookupError("Partner not found")
    return partner


def _chart_account(session: Session, code: str) -> Account:
    account = session.scalar(select(Account).where(Account.code == code))
    if account is None:
        raise InvalidAccountError(f"chart account {code} not found")
    if not account.is_active:
        raise InvalidAccountError(f"account {code} is not active")
    return account


def _validate_expense_account(
    session: Session, entity_id: uuid.UUID, account_id: uuid.UUID
) -> Account:
    account = session.get(Account, account_id)
    if account is None or account.entity_id != entity_id:
        raise InvalidAccountError("expense account not found for this entity")
    if not account.is_active:
        raise InvalidAccountError(f"account {account.code} is not active")
    if account.account_type != AccountType.EXPENSE:
        raise InvalidAccountError(
            f"account {account.code} is not an expense account"
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


def build_expense_fronted_lines(
    *,
    expense_account_id: uuid.UUID,
    partner_payable_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    if amount_kurus <= 0:
        raise ValueError("expense amount must be positive kuruş")

    return [
        PostingLine(
            account_id=expense_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=partner_payable_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_reimbursement_paid_lines(
    *,
    partner_payable_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    if amount_kurus <= 0:
        raise ValueError("reimbursement amount must be positive kuruş")

    return [
        PostingLine(
            account_id=partner_payable_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=payment_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_drawing_lines(
    *,
    drawings_account_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    if amount_kurus <= 0:
        raise ValueError("drawing amount must be positive kuruş")

    return [
        PostingLine(
            account_id=drawings_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=payment_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_drawing_repayment_lines(
    *,
    drawings_account_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    if amount_kurus <= 0:
        raise ValueError("drawing repayment amount must be positive kuruş")

    return [
        PostingLine(
            account_id=payment_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=drawings_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def post_expense_fronted(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    expense_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    expense_account_id: uuid.UUID,
) -> PartnerExpenseFrontedPostResult:
    """Partner paid business expense out of pocket — Dr expense / Cr 2150; subledger +amount."""
    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_partner(session, entity_id, partner_id)
        expense_gl = _validate_expense_account(session, entity_id, expense_account_id)
        partner_payable = _chart_account(session, PARTNER_REIMBURSEMENT_PAYABLE_CODE)

        lines = build_expense_fronted_lines(
            expense_account_id=expense_gl.id,
            partner_payable_id=partner_payable.id,
            amount_kurus=amount_kurus,
        )
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            expense_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.PARTNER_EXPENSE_FRONTED,
        )

        partner_entry = partner_ledger.persist_partner_ledger_entry(
            session,
            partner_id,
            movement_date=expense_date,
            movement_type=PartnerMovementType.EXPENSE_FRONTED,
            amount_kurus=amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(partner_entry)
        _ = list(journal_entry.lines)

        balance = partner_ledger.reimbursement_balance_kurus(session, entity_id, partner_id)
        return PartnerExpenseFrontedPostResult(
            journal_entry=journal_entry,
            partner_ledger_entry=partner_entry,
            balance_kurus=balance,
        )


def _reimbursement_balance(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> int:
    return partner_ledger.reimbursement_balance_kurus(session, entity_id, partner_id)


def _capital_balance(session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID) -> int:
    return partner_ledger.capital_balance_kurus(session, entity_id, partner_id)


def post_reimbursement_paid(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    payment_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
) -> PartnerReimbursementPaidPostResult:
    """Business repays partner — Dr 2150 / Cr cash; subledger -amount; no expense line."""
    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_partner(session, entity_id, partner_id)

        current = partner_ledger.current_balance_kurus(session, entity_id, partner_id)
        if current - amount_kurus < 0:
            raise partner_ledger.OverpaymentError(
                f"Reimbursement of {amount_kurus} exceeds partner balance of {current}"
            )

        payment_gl = _validate_payment_account(session, entity_id, payment_account_id)
        partner_payable = _chart_account(session, PARTNER_REIMBURSEMENT_PAYABLE_CODE)

        lines = build_reimbursement_paid_lines(
            partner_payable_id=partner_payable.id,
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
            source=JournalEntrySource.PARTNER_REIMBURSEMENT_PAID,
        )

        partner_entry = partner_ledger.persist_partner_ledger_entry(
            session,
            partner_id,
            movement_date=payment_date,
            movement_type=PartnerMovementType.REIMBURSEMENT_PAID,
            amount_kurus=-amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(partner_entry)
        _ = list(journal_entry.lines)

        balance = _reimbursement_balance(session, entity_id, partner_id)
        return PartnerReimbursementPaidPostResult(
            journal_entry=journal_entry,
            partner_ledger_entry=partner_entry,
            balance_kurus=balance,
        )


def post_drawing(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    drawing_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
) -> PartnerDrawingPostResult:
    """Partner withdraws cash — Dr 3200 / Cr cash; capital subledger -amount."""
    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_partner(session, entity_id, partner_id)

        payment_gl = _validate_payment_account(session, entity_id, payment_account_id)
        drawings_gl = _chart_account(session, OWNER_DRAWINGS_CODE)

        lines = build_drawing_lines(
            drawings_account_id=drawings_gl.id,
            payment_account_id=payment_gl.id,
            amount_kurus=amount_kurus,
        )
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            drawing_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.PARTNER_DRAWING,
        )

        partner_entry = partner_ledger.persist_partner_ledger_entry(
            session,
            partner_id,
            movement_date=drawing_date,
            movement_type=PartnerMovementType.DRAWING,
            amount_kurus=-amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(partner_entry)
        _ = list(journal_entry.lines)

        balance = _capital_balance(session, entity_id, partner_id)
        return PartnerDrawingPostResult(
            journal_entry=journal_entry,
            partner_ledger_entry=partner_entry,
            balance_kurus=balance,
        )


def post_drawing_repayment(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    payment_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
) -> PartnerDrawingRepaymentPostResult:
    """Partner repays a drawing — Dr cash / Cr 3200; capital subledger +amount."""
    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_partner(session, entity_id, partner_id)

        current = _capital_balance(session, entity_id, partner_id)
        if current >= 0:
            raise partner_ledger.OverRepaymentError(
                "Partner has no outstanding drawing balance to repay"
            )
        if amount_kurus > abs(current):
            raise partner_ledger.OverRepaymentError(
                f"Repayment of {amount_kurus} exceeds partner drawing balance of {abs(current)}"
            )

        payment_gl = _validate_payment_account(session, entity_id, payment_account_id)
        drawings_gl = _chart_account(session, OWNER_DRAWINGS_CODE)

        lines = build_drawing_repayment_lines(
            drawings_account_id=drawings_gl.id,
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
            source=JournalEntrySource.PARTNER_DRAWING_REPAYMENT,
        )

        partner_entry = partner_ledger.persist_partner_ledger_entry(
            session,
            partner_id,
            movement_date=payment_date,
            movement_type=PartnerMovementType.DRAWING_REPAYMENT,
            amount_kurus=amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(partner_entry)
        _ = list(journal_entry.lines)

        balance = _capital_balance(session, entity_id, partner_id)
        return PartnerDrawingRepaymentPostResult(
            journal_entry=journal_entry,
            partner_ledger_entry=partner_entry,
            balance_kurus=balance,
        )
