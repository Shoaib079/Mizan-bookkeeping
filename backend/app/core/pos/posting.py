"""POS GL posting — card sales batches and settlement deposits (Decisions §13)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import (
    BANK_CHARGES_CODE,
    CARD_SALES_CLEARING_CODE,
    SALES_REVENUE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.entities import service as entity_service
from app.features.pos.models import CardSalesBatch, PosSettlement


class InvalidPosSettlementError(ValueError):
    """POS settlement preconditions failed."""


class InvalidCardSalesBatchError(ValueError):
    """Card sales batch preconditions failed."""


class NothingToClearError(ValueError):
    """Card clearing balance is zero or negative — nothing to sweep as commission."""


@dataclass(frozen=True, slots=True)
class PosSettlementPostResult:
    journal_entry: JournalEntry
    pos_settlement: PosSettlement


@dataclass(frozen=True, slots=True)
class CardSalesBatchPostResult:
    journal_entry: JournalEntry
    card_sales_batch: CardSalesBatch


@dataclass(frozen=True, slots=True)
class CardCommissionClearanceResult:
    journal_entry: JournalEntry
    commission_kurus: int
    clearing_balance_before_kurus: int


def build_pos_settlement_posting_lines(
    *,
    bank_gl_account_id: uuid.UUID,
    clearing_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit bank, credit card sales clearing (net deposit only)."""
    if amount_kurus <= 0:
        raise ValueError("settlement amount must be positive kuruş")

    return [
        PostingLine(
            account_id=bank_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=clearing_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_pos_settlement_posting_lines_with_commission(
    *,
    bank_gl_account_id: uuid.UUID,
    clearing_account_id: uuid.UUID,
    bank_charges_account_id: uuid.UUID,
    net_amount_kurus: int,
    commission_kurus: int,
) -> list[PostingLine]:
    """GL pattern: Dr bank (net), Dr bank charges (commission), Cr clearing (gross)."""
    if net_amount_kurus <= 0:
        raise ValueError("settlement net amount must be positive kuruş")
    if commission_kurus <= 0:
        raise ValueError("commission must be positive kuruş for commission posting")

    gross_kurus = net_amount_kurus + commission_kurus
    return [
        PostingLine(
            account_id=bank_gl_account_id,
            amount_kurus=net_amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=bank_charges_account_id,
            amount_kurus=commission_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=clearing_account_id,
            amount_kurus=gross_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_card_sales_batch_posting_lines(
    *,
    clearing_account_id: uuid.UUID,
    sales_revenue_account_id: uuid.UUID,
    gross_amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit card sales clearing, credit sales revenue."""
    if gross_amount_kurus <= 0:
        raise ValueError("gross sales amount must be positive kuruş")

    return [
        PostingLine(
            account_id=clearing_account_id,
            amount_kurus=gross_amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=sales_revenue_account_id,
            amount_kurus=gross_amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def _get_account_by_code(session: Session, code: str) -> Account:
    account = session.scalar(select(Account).where(Account.code == code))
    if account is None:
        raise InvalidAccountError(f"account {code} not found")
    return account


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


def _validate_bank_money_account(
    session: Session, entity_id: uuid.UUID, money_account_id: uuid.UUID
) -> MoneyAccount:
    money_account = session.get(MoneyAccount, money_account_id)
    if money_account is None or money_account.entity_id != entity_id:
        raise InvalidPosSettlementError("Money account not found for this entity")
    if not money_account.is_active:
        raise InvalidPosSettlementError("Money account is not active")
    if money_account.account_kind != MoneyAccountKind.BANK:
        raise InvalidPosSettlementError("POS settlement requires a bank money account")
    return money_account


def _resolve_commission(
    session: Session,
    *,
    amount_kurus: int,
    commission_kurus: int | None,
    card_sales_batch_id: uuid.UUID | None,
) -> tuple[int, bool]:
    """Return effective commission and whether it was inferred from a linked batch."""
    if commission_kurus is not None:
        if commission_kurus < 0:
            raise InvalidPosSettlementError("commission_kurus must be >= 0")
        return commission_kurus, False

    if card_sales_batch_id is None:
        return 0, False

    batch = session.get(CardSalesBatch, card_sales_batch_id)
    if batch is None:
        raise InvalidPosSettlementError("Card sales batch not found for this entity")

    if batch.gross_amount_kurus < amount_kurus:
        raise InvalidPosSettlementError(
            "Settlement net amount exceeds linked card sales batch gross"
        )
    if batch.gross_amount_kurus == amount_kurus:
        return 0, False

    return batch.gross_amount_kurus - amount_kurus, True


def persist_pos_settlement(
    session: Session,
    *,
    money_account_id: uuid.UUID,
    settlement_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
    bank_statement_line_id: uuid.UUID | None = None,
    commission_kurus: int | None = None,
    commission_inferred: bool = False,
    card_sales_batch_id: uuid.UUID | None = None,
) -> PosSettlement:
    """Persist settlement row without commit — caller must hold entity_context."""
    if amount_kurus <= 0:
        raise ValueError("settlement amount_kurus must be positive")

    settlement = PosSettlement(
        money_account_id=money_account_id,
        settlement_date=settlement_date,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
        journal_entry_id=journal_entry_id,
        reference_type=reference_type,
        reference_id=reference_id,
        bank_statement_line_id=bank_statement_line_id,
        commission_kurus=commission_kurus if commission_kurus else None,
        commission_inferred=commission_inferred,
        card_sales_batch_id=card_sales_batch_id,
    )
    session.add(settlement)
    session.flush()
    session.refresh(settlement)
    return settlement


def persist_card_sales_batch(
    session: Session,
    *,
    sales_date: date,
    gross_amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
) -> CardSalesBatch:
    """Persist card sales batch row without commit — caller must hold entity_context."""
    if gross_amount_kurus <= 0:
        raise ValueError("gross_amount_kurus must be positive")

    batch = CardSalesBatch(
        sales_date=sales_date,
        gross_amount_kurus=gross_amount_kurus,
        description=description,
        actor_id=actor_id,
        journal_entry_id=journal_entry_id,
    )
    session.add(batch)
    session.flush()
    session.refresh(batch)
    return batch


def post_card_sales_batch(
    session: Session,
    entity_id: uuid.UUID,
    *,
    sales_date: date,
    gross_amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
) -> CardSalesBatchPostResult:
    """Post card sales to GL and persist CardSalesBatch in one transaction."""
    if gross_amount_kurus <= 0:
        raise ValueError("gross_amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        clearing_account = _get_account_by_code(session, CARD_SALES_CLEARING_CODE)
        sales_revenue_account = _get_account_by_code(session, SALES_REVENUE_CODE)

        lines = build_card_sales_batch_posting_lines(
            clearing_account_id=clearing_account.id,
            sales_revenue_account_id=sales_revenue_account.id,
            gross_amount_kurus=gross_amount_kurus,
        )

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            sales_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.CARD_SALES,
        )

        batch = persist_card_sales_batch(
            session,
            sales_date=sales_date,
            gross_amount_kurus=gross_amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(batch)
        _ = list(journal_entry.lines)

        return CardSalesBatchPostResult(
            journal_entry=journal_entry,
            card_sales_batch=batch,
        )


def post_card_commission_clearance(
    session: Session,
    entity_id: uuid.UUID,
    *,
    clearance_date: date,
    description: str,
    actor_id: uuid.UUID,
) -> CardCommissionClearanceResult:
    """Total clearance — book the current card-clearing (1400) residual as commission.

    Both banks' card deposits land in the one card-clearing account. Whatever is
    left after deposits is the hidden bank commission, so this sweeps the current
    1400 debit balance to 5300 bank charges (Dr 5300 / Cr 1400), zeroing 1400.

    Press it when all deposits for the period are in: any card sales not yet
    deposited still sit in 1400 and would be swept as commission. Rejects a zero
    or negative clearing balance (nothing to clear / deposits exceed sales).
    """
    from app.features.banking import service as banking_service

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        clearing_account = _get_account_by_code(session, CARD_SALES_CLEARING_CODE)
        residual_kurus = banking_service.gl_balance_kurus(
            session, clearing_account.id, AccountNormalBalance.DEBIT
        )
        if residual_kurus == 0:
            raise NothingToClearError(
                "Card clearing balance is zero — nothing to clear as commission"
            )
        if residual_kurus < 0:
            raise NothingToClearError(
                "Card clearing balance is negative — deposits exceed card sales; "
                "review deposits before clearing commission"
            )

        bank_charges_account = _get_account_by_code(session, BANK_CHARGES_CODE)
        lines = [
            PostingLine(
                account_id=bank_charges_account.id,
                amount_kurus=residual_kurus,
                side=AccountNormalBalance.DEBIT,
            ),
            PostingLine(
                account_id=clearing_account.id,
                amount_kurus=residual_kurus,
                side=AccountNormalBalance.CREDIT,
            ),
        ]
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            clearance_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.POS_COMMISSION_SWEEP,
        )

        session.commit()
        session.refresh(journal_entry)
        _ = list(journal_entry.lines)

        return CardCommissionClearanceResult(
            journal_entry=journal_entry,
            commission_kurus=residual_kurus,
            clearing_balance_before_kurus=residual_kurus,
        )


def post_pos_settlement(
    session: Session,
    entity_id: uuid.UUID,
    *,
    money_account_id: uuid.UUID,
    settlement_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
    bank_statement_line_id: uuid.UUID | None = None,
    commission_kurus: int | None = None,
    card_sales_batch_id: uuid.UUID | None = None,
) -> PosSettlementPostResult:
    """Post card settlement deposit to GL and persist PosSettlement in one transaction."""
    if amount_kurus <= 0:
        raise ValueError("Settlement amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        if card_sales_batch_id is not None:
            existing = session.scalar(
                select(PosSettlement).where(
                    PosSettlement.card_sales_batch_id == card_sales_batch_id
                )
            )
            if existing is not None:
                journal_entry = session.get(JournalEntry, existing.journal_entry_id)
                if journal_entry is None:
                    raise InvalidPosSettlementError(
                        "linked settlement journal entry not found"
                    )
                return PosSettlementPostResult(
                    journal_entry=journal_entry,
                    pos_settlement=existing,
                )

        money_account = _validate_bank_money_account(session, entity_id, money_account_id)
        _validate_bank_gl_account(session, entity_id, money_account.gl_account_id)

        clearing_account = _get_account_by_code(session, CARD_SALES_CLEARING_CODE)

        effective_commission, commission_inferred = _resolve_commission(
            session,
            amount_kurus=amount_kurus,
            commission_kurus=commission_kurus,
            card_sales_batch_id=card_sales_batch_id,
        )

        if effective_commission > 0:
            bank_charges_account = _get_account_by_code(session, BANK_CHARGES_CODE)
            lines = build_pos_settlement_posting_lines_with_commission(
                bank_gl_account_id=money_account.gl_account_id,
                clearing_account_id=clearing_account.id,
                bank_charges_account_id=bank_charges_account.id,
                net_amount_kurus=amount_kurus,
                commission_kurus=effective_commission,
            )
        else:
            lines = build_pos_settlement_posting_lines(
                bank_gl_account_id=money_account.gl_account_id,
                clearing_account_id=clearing_account.id,
                amount_kurus=amount_kurus,
            )

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            settlement_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.POS_SETTLEMENT,
        )

        stored_commission = effective_commission if effective_commission > 0 else None
        settlement = persist_pos_settlement(
            session,
            money_account_id=money_account_id,
            settlement_date=settlement_date,
            amount_kurus=amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
            reference_type=reference_type,
            reference_id=reference_id,
            bank_statement_line_id=bank_statement_line_id,
            commission_kurus=stored_commission,
            commission_inferred=commission_inferred,
            card_sales_batch_id=card_sales_batch_id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(settlement)
        _ = list(journal_entry.lines)

        return PosSettlementPostResult(
            journal_entry=journal_entry,
            pos_settlement=settlement,
        )
