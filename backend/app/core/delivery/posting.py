"""Delivery platform GL posting — reports and settlements (Decisions §9)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.delivery.models import DeliveryReport, DeliveryReportStatus, DeliverySettlement
from app.features.delivery import platform_service
from app.features.entities import service as entity_service


class InvalidDeliveryReportError(ValueError):
    """Delivery report preconditions failed."""


class InvalidDeliverySettlementError(ValueError):
    """Delivery settlement preconditions failed."""


@dataclass(frozen=True, slots=True)
class DeliveryReportPostResult:
    journal_entry: JournalEntry
    delivery_report: DeliveryReport


@dataclass(frozen=True, slots=True)
class DeliverySettlementPostResult:
    journal_entry: JournalEntry
    delivery_settlement: DeliverySettlement


def report_math_valid(*, gross_kurus: int, commission_kurus: int, net_kurus: int) -> bool:
    return gross_kurus - commission_kurus == net_kurus


def build_delivery_report_posting_lines(
    *,
    clearing_account_id: uuid.UUID,
    sales_revenue_account_id: uuid.UUID,
    gross_amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit platform clearing, credit sales revenue (gross only)."""
    if gross_amount_kurus <= 0:
        raise ValueError("gross amount must be positive kuruş")

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


def build_delivery_settlement_posting_lines(
    *,
    bank_gl_account_id: uuid.UUID,
    clearing_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit bank, credit platform clearing (net payout only)."""
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
        raise InvalidDeliverySettlementError("Money account not found for this entity")
    if not money_account.is_active:
        raise InvalidDeliverySettlementError("Money account is not active")
    if money_account.account_kind != MoneyAccountKind.BANK:
        raise InvalidDeliverySettlementError(
            "Delivery settlement requires a bank money account"
        )
    return money_account


def persist_delivery_settlement(
    session: Session,
    *,
    delivery_platform_id: uuid.UUID,
    money_account_id: uuid.UUID,
    settlement_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
    bank_statement_line_id: uuid.UUID | None = None,
    delivery_report_id: uuid.UUID | None = None,
) -> DeliverySettlement:
    settlement = DeliverySettlement(
        delivery_platform_id=delivery_platform_id,
        money_account_id=money_account_id,
        settlement_date=settlement_date,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
        journal_entry_id=journal_entry_id,
        reference_type=reference_type,
        reference_id=reference_id,
        bank_statement_line_id=bank_statement_line_id,
        delivery_report_id=delivery_report_id,
    )
    session.add(settlement)
    session.flush()
    session.refresh(settlement)
    return settlement


def post_delivery_report(
    session: Session,
    entity_id: uuid.UUID,
    *,
    report: DeliveryReport,
    actor_id: uuid.UUID,
) -> DeliveryReportPostResult:
    """Post delivery report gross to GL and mark report posted."""
    if report.status not in (
        DeliveryReportStatus.DRAFT.value,
        DeliveryReportStatus.NEEDS_REVIEW.value,
    ):
        raise InvalidDeliveryReportError(
            f"cannot post report in status {report.status}"
        )

    if report.gross_kurus <= 0:
        raise InvalidDeliveryReportError("gross_kurus must be positive")
    if report.commission_kurus < 0 or report.net_kurus < 0:
        raise InvalidDeliveryReportError("commission and net must be >= 0")
    if not report_math_valid(
        gross_kurus=report.gross_kurus,
        commission_kurus=report.commission_kurus,
        net_kurus=report.net_kurus,
    ):
        raise InvalidDeliveryReportError(
            "gross_kurus - commission_kurus must equal net_kurus"
        )

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    platform = platform_service.get_delivery_platform_row(
        session, entity_id, report.delivery_platform_id
    )

    with entity_context(session, entity_id):
        require_entity_context()

        clearing_account = session.get(Account, platform.gl_account_id)
        if clearing_account is None:
            raise InvalidAccountError("platform clearing account not found")
        sales_revenue_account = _get_account_by_code(session, SALES_REVENUE_CODE)

        lines = build_delivery_report_posting_lines(
            clearing_account_id=clearing_account.id,
            sales_revenue_account_id=sales_revenue_account.id,
            gross_amount_kurus=report.gross_kurus,
        )

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            report.report_date,
            report.description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.DELIVERY_REPORT,
        )

        report.status = DeliveryReportStatus.POSTED.value
        report.actor_id = actor_id
        report.journal_entry_id = journal_entry.id
        report.posted_at = journal_entry.created_at
        report.posted_by = actor_id
        report.review_reason = None
        session.flush()

        session.commit()
        session.refresh(journal_entry)
        session.refresh(report)
        _ = list(journal_entry.lines)

        return DeliveryReportPostResult(
            journal_entry=journal_entry,
            delivery_report=report,
        )


def post_delivery_settlement(
    session: Session,
    entity_id: uuid.UUID,
    *,
    delivery_platform_id: uuid.UUID,
    money_account_id: uuid.UUID,
    settlement_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
    bank_statement_line_id: uuid.UUID | None = None,
    delivery_report_id: uuid.UUID | None = None,
) -> DeliverySettlementPostResult:
    """Post delivery platform payout to GL and persist DeliverySettlement."""
    if amount_kurus <= 0:
        raise ValueError("Settlement amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    platform = platform_service.get_delivery_platform_row(
        session, entity_id, delivery_platform_id
    )

    with entity_context(session, entity_id):
        require_entity_context()

        money_account = _validate_bank_money_account(session, entity_id, money_account_id)
        _validate_bank_gl_account(session, entity_id, money_account.gl_account_id)
        clearing_account = session.get(Account, platform.gl_account_id)
        if clearing_account is None:
            raise InvalidAccountError("platform clearing account not found")

        lines = build_delivery_settlement_posting_lines(
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
            source=JournalEntrySource.DELIVERY_SETTLEMENT,
        )

        settlement = persist_delivery_settlement(
            session,
            delivery_platform_id=delivery_platform_id,
            money_account_id=money_account_id,
            settlement_date=settlement_date,
            amount_kurus=amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
            reference_type=reference_type,
            reference_id=reference_id,
            bank_statement_line_id=bank_statement_line_id,
            delivery_report_id=delivery_report_id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(settlement)
        _ = list(journal_entry.lines)

        return DeliverySettlementPostResult(
            journal_entry=journal_entry,
            delivery_settlement=settlement,
        )
