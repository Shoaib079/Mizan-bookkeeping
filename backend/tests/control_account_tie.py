"""Control-account tie helpers for subledger correction tests."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.fx import ledger as fx_ledger
from app.core.fx.models import FxLedgerEntry
from app.core.ledger.models import JournalEntryLine
from app.core.payables.models import SupplierLedgerEntry
from app.core.receivables.models import CustomerLedgerEntry
from app.db.session import entity_context
from app.features.banking import service as banking_service


def gl_liability_balance(db_session, entity_id: uuid.UUID, account_id: uuid.UUID) -> int:
    with entity_context(db_session, entity_id):
        rows = db_session.execute(
            select(JournalEntryLine.side, func.sum(JournalEntryLine.amount_kurus))
            .where(JournalEntryLine.account_id == account_id)
            .group_by(JournalEntryLine.side)
        ).all()
        debits = credits = 0
        for side, total in rows:
            if side == AccountNormalBalance.DEBIT:
                debits = int(total or 0)
            else:
                credits = int(total or 0)
        return credits - debits


def gl_asset_balance(db_session, entity_id: uuid.UUID, account_id: uuid.UUID) -> int:
    with entity_context(db_session, entity_id):
        rows = db_session.execute(
            select(JournalEntryLine.side, func.sum(JournalEntryLine.amount_kurus))
            .where(JournalEntryLine.account_id == account_id)
            .group_by(JournalEntryLine.side)
        ).all()
        debits = credits = 0
        for side, total in rows:
            if side == AccountNormalBalance.DEBIT:
                debits = int(total or 0)
            else:
                credits = int(total or 0)
        return debits - credits


def supplier_subledger_total(db_session, entity_id: uuid.UUID) -> int:
    with entity_context(db_session, entity_id):
        total = db_session.scalar(
            select(func.coalesce(func.sum(SupplierLedgerEntry.amount_kurus), 0))
        )
        return int(total or 0)


def customer_subledger_total(db_session, entity_id: uuid.UUID) -> int:
    with entity_context(db_session, entity_id):
        total = db_session.scalar(
            select(func.coalesce(func.sum(CustomerLedgerEntry.amount_kurus), 0))
        )
        return int(total or 0)


def fx_try_cost_matches_gl(
    db_session, entity_id: uuid.UUID, fx_money_account_id: uuid.UUID
) -> tuple[int, int]:
    subledger_total = fx_ledger.try_cost_balance_kurus(
        db_session, entity_id, fx_money_account_id
    )
    with entity_context(db_session, entity_id):
        account = banking_service.get_money_account(
            db_session, entity_id, fx_money_account_id
        )
        gl_balance = banking_service.gl_balance_kurus(
            db_session, account.gl_account_id, AccountNormalBalance.DEBIT
        )
    return subledger_total, gl_balance


def books_balanced(db_session, entity_id: uuid.UUID) -> bool:
    with entity_context(db_session, entity_id):
        rows = db_session.execute(
            select(JournalEntryLine.side, func.sum(JournalEntryLine.amount_kurus))
            .group_by(JournalEntryLine.side)
        ).all()
        debits = credits = 0
        for side, total in rows:
            if side == AccountNormalBalance.DEBIT:
                debits = int(total or 0)
            else:
                credits = int(total or 0)
        return debits == credits
