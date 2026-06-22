"""Cash flow statement report (Phase 7 Slice 4)."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.ledger.balances import balance_as_of_kurus, net_cash_effect_on_accounts
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource, JournalEntryStatus
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.entities import service as entity_service
from app.features.reports.schema import (
    CashFlowCategoryRead,
    CashFlowRead,
    CashFlowSourceRow,
)
from app.features.reports.service import InvalidDateRangeError

__all__ = ["get_cash_flow"]

_OPERATING_SOURCES = frozenset(
    {
        JournalEntrySource.POS_SETTLEMENT,
        JournalEntrySource.DELIVERY_SETTLEMENT,
        JournalEntrySource.CUSTOMER_PAYMENT_RECEIVED,
        JournalEntrySource.PAYMENT,
        JournalEntrySource.EXPENSE_ENTRY,
        JournalEntrySource.BANK_FEE,
        JournalEntrySource.STAFF_PAYMENT,
        JournalEntrySource.STAFF_ADVANCE,
        JournalEntrySource.PARTNER_REIMBURSEMENT_PAID,
        JournalEntrySource.TIP_PAYOUT,
        JournalEntrySource.CASH_MOVEMENT,
        JournalEntrySource.FX_PURCHASE,
        JournalEntrySource.FX_CONVERSION,
        JournalEntrySource.FX_EXPENSE_SPEND,
        JournalEntrySource.CASH_DRAWER_CLOSE,
        JournalEntrySource.MANUAL,
        JournalEntrySource.INVOICE,
        JournalEntrySource.SYSTEM,
    }
)

_FINANCING_SOURCES = frozenset({JournalEntrySource.CREDIT_CARD_PAYMENT})

_EXCLUDED_SOURCES = frozenset({JournalEntrySource.TRANSFER})

_NON_CASH_SOURCES = frozenset(
    {
        JournalEntrySource.CARD_SALES,
        JournalEntrySource.DELIVERY_REPORT,
        JournalEntrySource.DELIVERY_COMMISSION,
        JournalEntrySource.TIP_ACCRUAL,
        JournalEntrySource.STAFF_ACCRUAL,
        JournalEntrySource.PARTNER_EXPENSE_FRONTED,
        JournalEntrySource.CUSTOMER_CREDIT_SALE,
    }
)


def _require_entity(session: Session, entity_id: uuid.UUID) -> None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")


def _try_liquid_gl_account_ids(session: Session) -> set[uuid.UUID]:
    money_accounts = session.scalars(
        select(MoneyAccount)
        .where(
            MoneyAccount.is_active.is_(True),
            MoneyAccount.account_kind.in_(
                (MoneyAccountKind.BANK, MoneyAccountKind.CASH),
            ),
        )
        .order_by(MoneyAccount.name)
    ).all()
    return {ma.gl_account_id for ma in money_accounts}


def _try_liquid_accounts(session: Session) -> list[Account]:
    money_accounts = session.scalars(
        select(MoneyAccount)
        .where(
            MoneyAccount.is_active.is_(True),
            MoneyAccount.account_kind.in_(
                (MoneyAccountKind.BANK, MoneyAccountKind.CASH),
            ),
        )
        .order_by(MoneyAccount.name)
    ).all()
    accounts: list[Account] = []
    for money_account in money_accounts:
        account = session.get(Account, money_account.gl_account_id)
        if account is not None and account.is_active:
            accounts.append(account)
    return accounts


def _source_category(source: JournalEntrySource) -> str:
    if source in _FINANCING_SOURCES:
        return "financing"
    if source in _OPERATING_SOURCES or source in _NON_CASH_SOURCES:
        return "operating"
    return "operating"


def _empty_category() -> CashFlowCategoryRead:
    return CashFlowCategoryRead(inflows_kurus=0, outflows_kurus=0, net_kurus=0)


def _apply_net(category: CashFlowCategoryRead, net_kurus: int) -> CashFlowCategoryRead:
    if net_kurus > 0:
        return CashFlowCategoryRead(
            inflows_kurus=category.inflows_kurus + net_kurus,
            outflows_kurus=category.outflows_kurus,
            net_kurus=category.net_kurus + net_kurus,
        )
    if net_kurus < 0:
        outflow = -net_kurus
        return CashFlowCategoryRead(
            inflows_kurus=category.inflows_kurus,
            outflows_kurus=category.outflows_kurus + outflow,
            net_kurus=category.net_kurus + net_kurus,
        )
    return category


def get_cash_flow(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
) -> CashFlowRead:
    if from_date > to_date:
        raise InvalidDateRangeError("from must be on or before to")

    _require_entity(session, entity_id)

    operating = _empty_category()
    investing = _empty_category()
    financing = _empty_category()
    by_source_net: dict[str, int] = defaultdict(int)
    by_source_category: dict[str, str] = {}
    opening_balance_cash_kurus = 0

    with entity_context(session, entity_id):
        require_entity_context()

        liquid_accounts = _try_liquid_accounts(session)
        liquid_ids = {account.id for account in liquid_accounts}

        day_before = from_date - timedelta(days=1)
        opening_cash_kurus = sum(
            balance_as_of_kurus(session, account, day_before)
            for account in liquid_accounts
        )
        closing_cash_kurus = sum(
            balance_as_of_kurus(session, account, to_date)
            for account in liquid_accounts
        )

        entry_ids = session.scalars(
            select(JournalEntry.id)
            .join(
                JournalEntryLine,
                JournalEntryLine.journal_entry_id == JournalEntry.id,
            )
            .where(
                JournalEntry.status == JournalEntryStatus.POSTED.value,
                JournalEntry.reverses_entry_id.is_(None),
                JournalEntry.entry_date >= from_date,
                JournalEntry.entry_date <= to_date,
                JournalEntryLine.account_id.in_(liquid_ids),
            )
            .distinct()
            .order_by(JournalEntry.id)
        ).all()

        for entry_id in entry_ids:
            entry = session.get(JournalEntry, entry_id)
            if entry is None:
                continue

            net_cash = net_cash_effect_on_accounts(session, entry_id, liquid_ids)
            if net_cash == 0:
                continue
            if entry.source == JournalEntrySource.OPENING_BALANCE:
                opening_balance_cash_kurus += net_cash
                continue
            if entry.source in _EXCLUDED_SOURCES:
                continue

            category_name = _source_category(entry.source)
            source_key = entry.source.value

            if category_name == "operating":
                operating = _apply_net(operating, net_cash)
            elif category_name == "investing":
                investing = _apply_net(investing, net_cash)
            else:
                financing = _apply_net(financing, net_cash)

            by_source_net[source_key] += net_cash
            by_source_category[source_key] = category_name

        opening_cash_kurus += opening_balance_cash_kurus

    net_change_kurus = closing_cash_kurus - opening_cash_kurus
    category_net_total = operating.net_kurus + investing.net_kurus + financing.net_kurus

    by_source = [
        CashFlowSourceRow(
            source=source,
            category=by_source_category[source],
            net_cash_kurus=net,
        )
        for source, net in sorted(by_source_net.items())
    ]

    return CashFlowRead(
        entity_id=entity_id,
        from_date=from_date,
        to_date=to_date,
        opening_cash_kurus=opening_cash_kurus,
        closing_cash_kurus=closing_cash_kurus,
        net_change_kurus=net_change_kurus,
        operating=operating,
        investing=investing,
        financing=financing,
        by_source=by_source,
        reconciled_to_categories=category_net_total == net_change_kurus,
    )
