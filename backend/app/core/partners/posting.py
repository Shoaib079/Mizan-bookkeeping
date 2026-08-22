"""Partner reimbursement GL posting (Decisions §17)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import (
    LOANS_PAYABLE_CODE,
    OWNER_DRAWINGS_CODE,
    PARTNER_CAPITAL_CODE,
    PARTNER_REIMBURSEMENT_PAYABLE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.banking import statement_posting
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.core.partners import ledger as partner_ledger
from app.core.partners.expense_accounts import validate_partner_fronted_expense_account
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


@dataclass(frozen=True, slots=True)
class PartnerPayCashPostResult:
    """One cash payout: settle fronted owe (2150) first, remainder as drawing (3200)."""

    reimbursement_journal_entry: JournalEntry | None
    drawing_journal_entry: JournalEntry | None
    reimbursement_ledger_entry: PartnerLedgerEntry | None
    drawing_ledger_entry: PartnerLedgerEntry | None
    reimbursement_kurus: int
    drawing_kurus: int
    balance_kurus: int
    net_balance_kurus: int


@dataclass(frozen=True, slots=True)
class PartnerCapitalContributionPostResult:
    journal_entry: JournalEntry
    partner_ledger_entry: PartnerLedgerEntry
    balance_kurus: int


@dataclass(frozen=True, slots=True)
class PartnerProfitPaidPostResult:
    journal_entry: JournalEntry
    partner_ledger_entry: PartnerLedgerEntry
    unpaid_profit_kurus: int
    balance_kurus: int


@dataclass(frozen=True, slots=True)
class PartnerLoanMovementPostResult:
    journal_entry: JournalEntry
    partner_ledger_entry: PartnerLedgerEntry
    loan_balance_kurus: int


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
    return validate_partner_fronted_expense_account(session, entity_id, account_id)


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

        # Limit by drawings net, not capital balance — capital contributions and
        # profit allocations make capital positive while drawings are still open.
        drawn = partner_ledger.drawings_net_kurus(session, entity_id, partner_id)
        if drawn >= 0:
            raise partner_ledger.OverRepaymentError(
                "Partner has no outstanding drawing balance to repay"
            )
        if amount_kurus > abs(drawn):
            raise partner_ledger.OverRepaymentError(
                f"Repayment of {amount_kurus} exceeds partner drawing balance of {abs(drawn)}"
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


def post_pay_partner(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    payment_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
) -> PartnerPayCashPostResult:
    """Pay partner from cash — settle 2150 owe first, excess as drawing (3200).

    One owner action for both “repay fronted expenses” and “partner took cash.”
    Bank payouts stay on statement classify (not this helper).
    """
    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        partner = _get_partner(session, entity_id, partner_id)

        from app.features.partners.ledger_display_description import (
            compose_partner_post_description,
        )

        reimb_description = compose_partner_post_description(
            movement_type=PartnerMovementType.REIMBURSEMENT_PAID.value,
            partner_name=partner.name,
            raw_note=description,
        )
        drawing_description = compose_partner_post_description(
            movement_type=PartnerMovementType.DRAWING.value,
            partner_name=partner.name,
            raw_note=description,
        )

        payment_gl = _validate_payment_account(session, entity_id, payment_account_id)
        owe = max(0, _reimbursement_balance(session, entity_id, partner_id))
        reimbursement_kurus = min(amount_kurus, owe)
        drawing_kurus = amount_kurus - reimbursement_kurus

        reimb_je: JournalEntry | None = None
        reimb_row: PartnerLedgerEntry | None = None
        drawing_je: JournalEntry | None = None
        drawing_row: PartnerLedgerEntry | None = None

        if reimbursement_kurus > 0:
            partner_payable = _chart_account(
                session, PARTNER_REIMBURSEMENT_PAYABLE_CODE
            )
            lines = build_reimbursement_paid_lines(
                partner_payable_id=partner_payable.id,
                payment_account_id=payment_gl.id,
                amount_kurus=reimbursement_kurus,
            )
            reimb_je = prepare_journal_entry(
                session,
                entity_id,
                payment_date,
                reimb_description,
                lines,
                actor_id=actor_id,
                source=JournalEntrySource.PARTNER_REIMBURSEMENT_PAID,
            )
            reimb_row = partner_ledger.persist_partner_ledger_entry(
                session,
                partner_id,
                movement_date=payment_date,
                movement_type=PartnerMovementType.REIMBURSEMENT_PAID,
                amount_kurus=-reimbursement_kurus,
                description=reimb_description,
                actor_id=actor_id,
                journal_entry_id=reimb_je.id,
            )

        if drawing_kurus > 0:
            drawings_gl = _chart_account(session, OWNER_DRAWINGS_CODE)
            lines = build_drawing_lines(
                drawings_account_id=drawings_gl.id,
                payment_account_id=payment_gl.id,
                amount_kurus=drawing_kurus,
            )
            drawing_je = prepare_journal_entry(
                session,
                entity_id,
                payment_date,
                drawing_description,
                lines,
                actor_id=actor_id,
                source=JournalEntrySource.PARTNER_DRAWING,
            )
            drawing_row = partner_ledger.persist_partner_ledger_entry(
                session,
                partner_id,
                movement_date=payment_date,
                movement_type=PartnerMovementType.DRAWING,
                amount_kurus=-drawing_kurus,
                description=drawing_description,
                actor_id=actor_id,
                journal_entry_id=drawing_je.id,
            )

        session.commit()
        if reimb_je is not None:
            session.refresh(reimb_je)
            _ = list(reimb_je.lines)
        if drawing_je is not None:
            session.refresh(drawing_je)
            _ = list(drawing_je.lines)
        if reimb_row is not None:
            session.refresh(reimb_row)
        if drawing_row is not None:
            session.refresh(drawing_row)

        return PartnerPayCashPostResult(
            reimbursement_journal_entry=reimb_je,
            drawing_journal_entry=drawing_je,
            reimbursement_ledger_entry=reimb_row,
            drawing_ledger_entry=drawing_row,
            reimbursement_kurus=reimbursement_kurus,
            drawing_kurus=drawing_kurus,
            balance_kurus=_reimbursement_balance(session, entity_id, partner_id),
            net_balance_kurus=partner_ledger.net_balance_kurus(
                session, entity_id, partner_id
            ),
        )


def build_capital_contribution_lines(
    *,
    payment_account_id: uuid.UUID,
    partner_capital_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    if amount_kurus <= 0:
        raise ValueError("capital contribution amount must be positive kuruş")
    return [
        PostingLine(
            account_id=payment_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=partner_capital_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def post_capital_contribution(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    contribution_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
) -> PartnerCapitalContributionPostResult:
    """Partner invests equity — Dr bank / Cr 3300; capital subledger +amount."""
    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_partner(session, entity_id, partner_id)
        payment_gl = _validate_payment_account(session, entity_id, payment_account_id)
        capital_gl = _chart_account(session, PARTNER_CAPITAL_CODE)

        lines = build_capital_contribution_lines(
            payment_account_id=payment_gl.id,
            partner_capital_id=capital_gl.id,
            amount_kurus=amount_kurus,
        )
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            contribution_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.PARTNER_CAPITAL_CONTRIBUTION,
        )

        partner_entry = partner_ledger.persist_partner_ledger_entry(
            session,
            partner_id,
            movement_date=contribution_date,
            movement_type=PartnerMovementType.CAPITAL_CONTRIBUTION,
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
        return PartnerCapitalContributionPostResult(
            journal_entry=journal_entry,
            partner_ledger_entry=partner_entry,
            balance_kurus=balance,
        )


def build_profit_paid_lines(
    *,
    partner_capital_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """Pay allocated profit from cash/bank — Dr 3300 / Cr money account."""
    if amount_kurus <= 0:
        raise ValueError("profit payment amount must be positive kuruş")
    return [
        PostingLine(
            account_id=partner_capital_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=payment_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def post_profit_paid(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    payment_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
) -> PartnerProfitPaidPostResult:
    """Pay partner's allocated profit from cash or bank — Dr 3300 / Cr money."""
    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_partner(session, entity_id, partner_id)

        unpaid = partner_ledger.unpaid_profit_kurus(session, entity_id, partner_id)
        if unpaid <= 0:
            raise partner_ledger.OverProfitPaymentError(
                "Partner has no unpaid allocated profit to pay"
            )
        if amount_kurus > unpaid:
            raise partner_ledger.OverProfitPaymentError(
                f"Payment of {amount_kurus} exceeds unpaid profit of {unpaid}"
            )

        payment_gl = _validate_payment_account(session, entity_id, payment_account_id)
        capital_gl = _chart_account(session, PARTNER_CAPITAL_CODE)

        lines = build_profit_paid_lines(
            partner_capital_id=capital_gl.id,
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
            source=JournalEntrySource.PARTNER_PROFIT_PAID,
        )

        partner_entry = partner_ledger.persist_partner_ledger_entry(
            session,
            partner_id,
            movement_date=payment_date,
            movement_type=PartnerMovementType.PROFIT_PAID,
            amount_kurus=-amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(partner_entry)
        _ = list(journal_entry.lines)

        unpaid_after = partner_ledger.unpaid_profit_kurus(session, entity_id, partner_id)
        balance = _capital_balance(session, entity_id, partner_id)
        return PartnerProfitPaidPostResult(
            journal_entry=journal_entry,
            partner_ledger_entry=partner_entry,
            unpaid_profit_kurus=unpaid_after,
            balance_kurus=balance,
        )


def post_partner_loan_receipt(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    receipt_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
) -> PartnerLoanMovementPostResult:
    """Partner lends to the business — Dr bank / Cr 2200; loan subledger +amount."""
    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_partner(session, entity_id, partner_id)
        payment_gl = _validate_payment_account(session, entity_id, payment_account_id)
        loans_gl = _chart_account(session, LOANS_PAYABLE_CODE)

        lines = statement_posting.build_loan_receipt_lines(
            bank_gl_account_id=payment_gl.id,
            loans_payable_account_id=loans_gl.id,
            amount_kurus=amount_kurus,
        )
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            receipt_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.PARTNER_LOAN_RECEIVED,
        )

        partner_entry = partner_ledger.persist_partner_ledger_entry(
            session,
            partner_id,
            movement_date=receipt_date,
            movement_type=PartnerMovementType.PARTNER_LOAN_RECEIVED,
            amount_kurus=amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(partner_entry)
        _ = list(journal_entry.lines)

        balance = partner_ledger.loan_balance_kurus(session, entity_id, partner_id)
        return PartnerLoanMovementPostResult(
            journal_entry=journal_entry,
            partner_ledger_entry=partner_entry,
            loan_balance_kurus=balance,
        )


def post_partner_loan_payment(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    payment_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
) -> PartnerLoanMovementPostResult:
    """Repay a partner loan — Dr 2200 / Cr bank; loan subledger -amount."""
    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_partner(session, entity_id, partner_id)

        current = partner_ledger.loan_balance_kurus(session, entity_id, partner_id)
        if current <= 0:
            raise partner_ledger.OverLoanRepaymentError(
                "Partner has no outstanding loan balance to repay"
            )
        if amount_kurus > current:
            raise partner_ledger.OverLoanRepaymentError(
                f"Repayment of {amount_kurus} exceeds partner loan balance of {current}"
            )

        payment_gl = _validate_payment_account(session, entity_id, payment_account_id)
        loans_gl = _chart_account(session, LOANS_PAYABLE_CODE)

        lines = statement_posting.build_loan_payment_lines(
            loans_payable_account_id=loans_gl.id,
            bank_gl_account_id=payment_gl.id,
            amount_kurus=amount_kurus,
        )
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            payment_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.PARTNER_LOAN_REPAID,
        )

        partner_entry = partner_ledger.persist_partner_ledger_entry(
            session,
            partner_id,
            movement_date=payment_date,
            movement_type=PartnerMovementType.PARTNER_LOAN_REPAID,
            amount_kurus=-amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(partner_entry)
        _ = list(journal_entry.lines)

        balance = partner_ledger.loan_balance_kurus(session, entity_id, partner_id)
        return PartnerLoanMovementPostResult(
            journal_entry=journal_entry,
            partner_ledger_entry=partner_entry,
            loan_balance_kurus=balance,
        )


def format_try_description_amount(kurus: int) -> str:
    """Compact TRY for ledger descriptions (e.g. 123456 → 1.234,56)."""
    negative = kurus < 0
    n = abs(kurus)
    whole, frac = divmod(n, 100)
    whole_str = f"{whole:,}".replace(",", ".")
    text = f"{whole_str},{frac:02d}"
    return f"-{text}" if negative else text


def compose_split_buy_description(
    *,
    note: str,
    invoice_number: str | None,
    restaurant_amount_kurus: int,
    personal_amount_kurus: int,
) -> str:
    parts = [note.strip()]
    inv = (invoice_number or "").strip()
    if inv:
        parts.append(f"Invoice {inv}")
    if personal_amount_kurus > 0:
        parts.append(f"Personal {format_try_description_amount(personal_amount_kurus)}")
    if restaurant_amount_kurus > 0:
        parts.append(
            f"Restaurant {format_try_description_amount(restaurant_amount_kurus)}"
        )
    text = " · ".join(parts)
    if len(text) > 512:
        text = text[:509] + "…"
    return text


@dataclass(frozen=True, slots=True)
class PartnerSplitBuyPostResult:
    journal_entry_ids: list[uuid.UUID]
    partner_ledger_entry: PartnerLedgerEntry | None
    balance_kurus: int
    description: str


def post_partner_split_buy(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    expense_date: date,
    restaurant_amount_kurus: int,
    personal_amount_kurus: int,
    note: str,
    actor_id: uuid.UUID,
    expense_account_id: uuid.UUID | None = None,
    supplier_id: uuid.UUID | None = None,
    invoice_number: str | None = None,
) -> PartnerSplitBuyPostResult:
    """Amount-split buy: pocket fronted and/or clear supplier AP (Decisions 2026-08-04)."""
    if restaurant_amount_kurus < 0 or personal_amount_kurus < 0:
        raise ValueError("amounts must not be negative")
    if restaurant_amount_kurus == 0 and personal_amount_kurus == 0:
        raise ValueError("restaurant or personal amount must be positive")

    note_clean = note.strip()
    if not note_clean:
        raise ValueError("note is required")

    description = compose_split_buy_description(
        note=note_clean,
        invoice_number=invoice_number,
        restaurant_amount_kurus=restaurant_amount_kurus,
        personal_amount_kurus=personal_amount_kurus,
    )

    if supplier_id is None:
        if restaurant_amount_kurus <= 0:
            raise InvalidPartnerPostingError(
                "Restaurant amount is required when no supplier is selected "
                "(personal-only pocket buys are not recorded on the books)"
            )
        if expense_account_id is None:
            raise InvalidPartnerPostingError(
                "expense_account_id is required when posting a pocket restaurant share"
            )
        result = post_expense_fronted(
            session,
            entity_id,
            partner_id,
            expense_date=expense_date,
            amount_kurus=restaurant_amount_kurus,
            description=description,
            actor_id=actor_id,
            expense_account_id=expense_account_id,
        )
        return PartnerSplitBuyPostResult(
            journal_entry_ids=[result.journal_entry.id],
            partner_ledger_entry=result.partner_ledger_entry,
            balance_kurus=result.balance_kurus,
            description=description,
        )

    return _post_partner_paid_supplier_split(
        session,
        entity_id,
        partner_id,
        expense_date=expense_date,
        restaurant_amount_kurus=restaurant_amount_kurus,
        personal_amount_kurus=personal_amount_kurus,
        description=description,
        actor_id=actor_id,
        expense_account_id=expense_account_id,
        supplier_id=supplier_id,
    )


def _post_partner_paid_supplier_split(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    expense_date: date,
    restaurant_amount_kurus: int,
    personal_amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    expense_account_id: uuid.UUID | None,
    supplier_id: uuid.UUID,
) -> PartnerSplitBuyPostResult:
    from app.core.chart_of_accounts.default_chart import ACCOUNTS_PAYABLE_CODE
    from app.core.payables import ledger as payables_ledger
    from app.core.payables.posting import persist_supplier_payment_entry
    from app.features.suppliers.models import Supplier

    total = restaurant_amount_kurus + personal_amount_kurus
    if total <= 0:
        raise ValueError("restaurant or personal amount must be positive")

    if personal_amount_kurus > 0 and expense_account_id is None:
        raise InvalidPartnerPostingError(
            "expense_account_id is required to reverse the personal share from P&L"
        )

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    payable = payables_ledger.current_balance_kurus(session, entity_id, supplier_id)
    if total > payable:
        raise InvalidPartnerPostingError(
            f"Split total {total} exceeds supplier payable of {payable}"
        )

    with entity_context(session, entity_id):
        require_entity_context()
        _get_partner(session, entity_id, partner_id)
        if session.get(Supplier, supplier_id) is None:
            raise LookupError("Supplier not found")

        ap_gl = _chart_account(session, ACCOUNTS_PAYABLE_CODE)
        partner_payable = _chart_account(session, PARTNER_REIMBURSEMENT_PAYABLE_CODE)
        expense_gl = None
        if personal_amount_kurus > 0:
            assert expense_account_id is not None
            expense_gl = _validate_expense_account(
                session, entity_id, expense_account_id
            )

        lines: list[PostingLine] = [
            PostingLine(
                account_id=ap_gl.id,
                amount_kurus=total,
                side=AccountNormalBalance.DEBIT,
            )
        ]
        if restaurant_amount_kurus > 0:
            lines.append(
                PostingLine(
                    account_id=partner_payable.id,
                    amount_kurus=restaurant_amount_kurus,
                    side=AccountNormalBalance.CREDIT,
                )
            )
        if personal_amount_kurus > 0 and expense_gl is not None:
            lines.append(
                PostingLine(
                    account_id=expense_gl.id,
                    amount_kurus=personal_amount_kurus,
                    side=AccountNormalBalance.CREDIT,
                )
            )

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            expense_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.PARTNER_SUPPLIER_PAID,
        )

        persist_supplier_payment_entry(
            session,
            supplier_id,
            movement_date=expense_date,
            amount_kurus=-total,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )

        partner_entry = None
        if restaurant_amount_kurus > 0:
            partner_entry = partner_ledger.persist_partner_ledger_entry(
                session,
                partner_id,
                movement_date=expense_date,
                movement_type=PartnerMovementType.EXPENSE_FRONTED,
                amount_kurus=restaurant_amount_kurus,
                description=description,
                actor_id=actor_id,
                journal_entry_id=journal_entry.id,
            )

        session.commit()
        session.refresh(journal_entry)
        if partner_entry is not None:
            session.refresh(partner_entry)
        _ = list(journal_entry.lines)

        balance = partner_ledger.reimbursement_balance_kurus(
            session, entity_id, partner_id
        )
        return PartnerSplitBuyPostResult(
            journal_entry_ids=[journal_entry.id],
            partner_ledger_entry=partner_entry,
            balance_kurus=balance,
            description=description,
        )


EXPENSE_SPLIT_REFERENCE_TYPE = "expense_entry"
SUPPLIER_PAYMENT_SPLIT_REFERENCE_TYPE = "supplier_ledger_entry"


@dataclass(frozen=True, slots=True)
class ExpensePersonalSplitPostResult:
    journal_entry: JournalEntry
    partner_ledger_entry: PartnerLedgerEntry
    personal_amount_kurus: int
    restaurant_amount_kurus: int
    remaining_splittable_kurus: int
    description: str


def personal_already_split_from_expense_kurus(
    session: Session,
    expense_id: uuid.UUID,
) -> int:
    """Net personal already peeled off this expense (voids reverse)."""
    from sqlalchemy import func

    total = session.scalar(
        select(func.coalesce(func.sum(-PartnerLedgerEntry.amount_kurus), 0)).where(
            PartnerLedgerEntry.reference_type == EXPENSE_SPLIT_REFERENCE_TYPE,
            PartnerLedgerEntry.reference_id == expense_id,
            PartnerLedgerEntry.movement_type == PartnerMovementType.DRAWING,
        )
    )
    return int(total or 0)


def personal_already_split_from_supplier_payment_kurus(
    session: Session,
    supplier_ledger_entry_id: uuid.UUID,
) -> int:
    """Net personal already peeled off this supplier payment (voids reverse)."""
    from sqlalchemy import func

    total = session.scalar(
        select(func.coalesce(func.sum(-PartnerLedgerEntry.amount_kurus), 0)).where(
            PartnerLedgerEntry.reference_type == SUPPLIER_PAYMENT_SPLIT_REFERENCE_TYPE,
            PartnerLedgerEntry.reference_id == supplier_ledger_entry_id,
            PartnerLedgerEntry.movement_type == PartnerMovementType.DRAWING,
        )
    )
    return int(total or 0)


def post_expense_personal_split(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    expense_id: uuid.UUID,
    personal_amount_kurus: int,
    note: str,
    actor_id: uuid.UUID,
) -> ExpensePersonalSplitPostResult:
    """Peel personal share off a posted bank expense onto partner drawings.

    Dr 3200 / Cr expense — bank untouched (Decisions 2026-08-04 Split hub).
    """
    from app.features.expenses.models import ExpenseEntry, ExpenseEntryStatus

    if personal_amount_kurus <= 0:
        raise ValueError("personal_amount_kurus must be positive")

    note_clean = note.strip()
    if not note_clean:
        raise ValueError("note is required")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_partner(session, entity_id, partner_id)

        expense = session.get(ExpenseEntry, expense_id)
        if expense is None:
            raise LookupError("Expense not found")
        if expense.status != ExpenseEntryStatus.POSTED:
            raise InvalidPartnerPostingError("expense must be posted")
        if expense.bank_statement_line_id is None:
            raise InvalidPartnerPostingError(
                "only bank-linked expenses can be split on the Split hub"
            )
        if expense.journal_entry_id is None:
            raise InvalidPartnerPostingError("expense has no journal entry")

        already = personal_already_split_from_expense_kurus(session, expense_id)
        remaining = expense.amount_kurus - already
        if remaining <= 0:
            raise InvalidPartnerPostingError(
                "this expense has no remaining amount to split"
            )
        if personal_amount_kurus > remaining:
            raise InvalidPartnerPostingError(
                f"Personal {personal_amount_kurus} exceeds remaining "
                f"splittable amount of {remaining}"
            )

        restaurant_amount_kurus = expense.amount_kurus - already - personal_amount_kurus
        description = compose_split_buy_description(
            note=note_clean,
            invoice_number=None,
            restaurant_amount_kurus=restaurant_amount_kurus
            if restaurant_amount_kurus > 0
            else 0,
            personal_amount_kurus=personal_amount_kurus,
        )
        # Always show original expense total context when useful.
        if expense.description and expense.description not in description:
            prefix = f"{expense.description} · "
            if len(prefix) + len(description) <= 512:
                description = prefix + description
            else:
                description = (prefix + description)[:509] + "…"

        drawings_gl = _chart_account(session, OWNER_DRAWINGS_CODE)
        expense_gl = _validate_expense_account(
            session, entity_id, expense.expense_account_id
        )

        lines = [
            PostingLine(
                account_id=drawings_gl.id,
                amount_kurus=personal_amount_kurus,
                side=AccountNormalBalance.DEBIT,
            ),
            PostingLine(
                account_id=expense_gl.id,
                amount_kurus=personal_amount_kurus,
                side=AccountNormalBalance.CREDIT,
            ),
        ]
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            expense.expense_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.EXPENSE_PERSONAL_SPLIT,
        )

        partner_entry = partner_ledger.persist_partner_ledger_entry(
            session,
            partner_id,
            movement_date=expense.expense_date,
            movement_type=PartnerMovementType.DRAWING,
            amount_kurus=-personal_amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
            reference_type=EXPENSE_SPLIT_REFERENCE_TYPE,
            reference_id=expense_id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(partner_entry)
        _ = list(journal_entry.lines)

        remaining_after = remaining - personal_amount_kurus
        return ExpensePersonalSplitPostResult(
            journal_entry=journal_entry,
            partner_ledger_entry=partner_entry,
            personal_amount_kurus=personal_amount_kurus,
            restaurant_amount_kurus=restaurant_amount_kurus,
            remaining_splittable_kurus=remaining_after,
            description=description,
        )


def post_supplier_payment_personal_split(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    *,
    supplier_ledger_entry_id: uuid.UUID,
    personal_amount_kurus: int,
    expense_account_id: uuid.UUID,
    note: str,
    actor_id: uuid.UUID,
) -> ExpensePersonalSplitPostResult:
    """Peel personal share off a posted supplier payment onto partner drawings.

    Bank/AP already settled — Dr 3200 / Cr expense only (Split hub).
    """
    from app.core.ledger.models import JournalEntryStatus
    from app.core.payables.models import SupplierLedgerEntry
    from app.core.payables.types import SupplierMovementType
    from app.features.suppliers.models import Supplier

    if personal_amount_kurus <= 0:
        raise ValueError("personal_amount_kurus must be positive")

    note_clean = note.strip()
    if not note_clean:
        raise ValueError("note is required")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_partner(session, entity_id, partner_id)

        payment_row = session.get(SupplierLedgerEntry, supplier_ledger_entry_id)
        if payment_row is None:
            raise LookupError("Supplier payment not found")
        if payment_row.movement_type != SupplierMovementType.PAYMENT:
            raise InvalidPartnerPostingError("not a supplier payment")
        if payment_row.journal_entry_id is None:
            raise InvalidPartnerPostingError("payment has no journal entry")

        payment_je = session.get(JournalEntry, payment_row.journal_entry_id)
        if payment_je is None or payment_je.status != JournalEntryStatus.POSTED:
            raise InvalidPartnerPostingError("payment journal is not posted")
        if payment_je.source != JournalEntrySource.PAYMENT:
            raise InvalidPartnerPostingError(
                "only normal supplier payments can be split here "
                "(partner paid-supplier splits use Partners → Split buy)"
            )

        payment_amount = abs(payment_row.amount_kurus)
        already = personal_already_split_from_supplier_payment_kurus(
            session, supplier_ledger_entry_id
        )
        remaining = payment_amount - already
        if remaining <= 0:
            raise InvalidPartnerPostingError(
                "this payment has no remaining amount to split"
            )
        if personal_amount_kurus > remaining:
            raise InvalidPartnerPostingError(
                f"Personal {personal_amount_kurus} exceeds remaining "
                f"splittable amount of {remaining}"
            )

        restaurant_amount_kurus = payment_amount - already - personal_amount_kurus
        supplier = session.get(Supplier, payment_row.supplier_id)
        supplier_name = supplier.name if supplier is not None else "Supplier"
        description = compose_split_buy_description(
            note=note_clean,
            invoice_number=None,
            restaurant_amount_kurus=restaurant_amount_kurus
            if restaurant_amount_kurus > 0
            else 0,
            personal_amount_kurus=personal_amount_kurus,
        )
        prefix = f"{supplier_name} payment · "
        if payment_row.description and payment_row.description not in description:
            prefix = f"{supplier_name}: {payment_row.description} · "
        if len(prefix) + len(description) <= 512:
            description = prefix + description
        else:
            description = (prefix + description)[:509] + "…"

        drawings_gl = _chart_account(session, OWNER_DRAWINGS_CODE)
        expense_gl = _validate_expense_account(
            session, entity_id, expense_account_id
        )

        lines = [
            PostingLine(
                account_id=drawings_gl.id,
                amount_kurus=personal_amount_kurus,
                side=AccountNormalBalance.DEBIT,
            ),
            PostingLine(
                account_id=expense_gl.id,
                amount_kurus=personal_amount_kurus,
                side=AccountNormalBalance.CREDIT,
            ),
        ]
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            payment_row.movement_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.EXPENSE_PERSONAL_SPLIT,
        )

        partner_entry = partner_ledger.persist_partner_ledger_entry(
            session,
            partner_id,
            movement_date=payment_row.movement_date,
            movement_type=PartnerMovementType.DRAWING,
            amount_kurus=-personal_amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
            reference_type=SUPPLIER_PAYMENT_SPLIT_REFERENCE_TYPE,
            reference_id=supplier_ledger_entry_id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(partner_entry)
        _ = list(journal_entry.lines)

        remaining_after = remaining - personal_amount_kurus
        return ExpensePersonalSplitPostResult(
            journal_entry=journal_entry,
            partner_ledger_entry=partner_entry,
            personal_amount_kurus=personal_amount_kurus,
            restaurant_amount_kurus=restaurant_amount_kurus,
            remaining_splittable_kurus=remaining_after,
            description=description,
        )
