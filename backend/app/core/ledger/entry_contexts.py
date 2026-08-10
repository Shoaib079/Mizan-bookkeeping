"""What each edit form needs, read off the row behind the entry.

One function per edit kind, and nothing but field copying — no decisions, no
queries except the one the profit allocation needs, no knowledge of whether
the entry may be edited at all. That question is `entry_capabilities`; this is
only the answer's payload.

Split out when the file-size ratchet caught `entry_capabilities.py` growing
past its baseline while a write-off edit form was wired. These are the part
that grows every time a form wants another field, so they are the part that
belongs somewhere it can grow.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntry
from app.core.ledger.models import JournalEntry
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import Any


def _expense_context(_session: Session, _entry: JournalEntry, row: Any) -> dict:
    return {
        "id": str(row.id),
        "expense_date": row.expense_date.isoformat(),
        "description": row.description,
        "written_item_description": row.written_item_description,
        "notes": row.notes,
        "amount_kurus": row.amount_kurus,
        "expense_account_id": str(row.expense_account_id),
        "money_account_id": str(row.money_account_id),
        "status": row.status.value,
        "journal_entry_id": str(row.journal_entry_id),
    }


def _partner_ledger_context(_session: Session, _entry: JournalEntry, row: Any) -> dict:
    return {
        "partner_id": str(row.partner_id),
        "movement_type": row.movement_type.value,
        "movement_date": row.movement_date.isoformat(),
        "amount_kurus": row.amount_kurus,
        "description": row.description,
    }


def _staff_ledger_context(_session: Session, _entry: JournalEntry, row: Any) -> dict:
    return {
        "employee_id": str(row.employee_id),
        "movement_type": row.movement_type.value,
        "movement_date": row.movement_date.isoformat(),
        "amount_minor": row.amount_minor,
        "description": row.description,
        "extra_days": row.extra_days,
    }


def _customer_payment_context(_session: Session, _entry: JournalEntry, row: Any) -> dict:
    return {
        "customer_id": str(row.customer_id),
        "movement_date": row.movement_date.isoformat(),
        "amount_kurus": row.amount_kurus,
        "description": row.description,
        "payment_native_quantity": row.payment_native_quantity,
        "forex_currency": row.forex_currency,
    }


def _supplier_row_context(_session: Session, _entry: JournalEntry, row: Any) -> dict:
    return {
        "supplier_id": str(row.supplier_id),
        "movement_date": row.movement_date.isoformat(),
        "amount_kurus": row.amount_kurus,
        "description": row.description,
    }


def _fx_currency(session: Session, row: Any) -> str | None:
    """The wallet's currency, which the FX row itself does not carry.

    `FxLedgerEntry` names the money account and nothing about what is in it,
    so every form correcting one has to be told separately. One hop, and the
    only reason the two FX edit kinds were unreachable from the ledger.
    """
    from app.features.banking.models import MoneyAccount

    account = session.get(MoneyAccount, row.fx_money_account_id)
    return account.currency if account is not None else None


def _fx_purchase_context(session: Session, _entry: JournalEntry, row: Any) -> dict:
    return {
        "movement_date": row.movement_date.isoformat(),
        "native_quantity": row.native_quantity,
        "try_cost_kurus": row.try_cost_kurus,
        "description": row.description,
        # The form needs to know which wallet and which currency. The account
        # is on the row; the currency is one hop further, on the account. It
        # carried neither, so the General ledger had a form it could not open
        # and an FX purchase with a wrong rate had to be voided and re-entered.
        "fx_money_account_id": str(row.fx_money_account_id),
        "currency": _fx_currency(session, row),
    }


def _fx_ledger_context(session: Session, entry: JournalEntry, row: Any) -> dict:
    return {
        "movement_date": row.movement_date.isoformat(),
        "movement_type": row.movement_type.value,
        "native_quantity": row.native_quantity,
        "try_cost_kurus": row.try_cost_kurus,
        "description": row.description,
        "journal_source": entry.source.value,
        "fx_money_account_id": str(row.fx_money_account_id),
        "currency": _fx_currency(session, row),
    }


def _delivery_commission_context(
    _session: Session, entry: JournalEntry, row: Any
) -> dict:
    return {
        "draft_id": str(row.id),
        "invoice_number": row.invoice_number,
        "movement_date": row.invoice_date.isoformat(),
        "net_kurus": row.net_kurus,
        "gross_kurus": row.gross_kurus,
        "description": entry.description,
    }


def _profit_allocation_context(
    session: Session, entry: JournalEntry, _row: Any
) -> dict:
    """Read off the entry's own lines — there is no subledger row to read.

    The allocated profit is whatever was debited to retained earnings, which
    is why this one needs the session and the others do not.
    """
    from app.core.chart_of_accounts.default_chart import RETAINED_EARNINGS_CODE
    from app.core.chart_of_accounts.models import Account
    from app.core.chart_of_accounts.types import AccountNormalBalance

    retained = session.scalar(
        select(Account).where(Account.code == RETAINED_EARNINGS_CODE)
    )
    profit_kurus = 0
    if retained is not None:
        profit_kurus = sum(
            line.amount_kurus
            for line in entry.lines
            if line.account_id == retained.id
            and line.side == AccountNormalBalance.DEBIT
        )
    return {
        "journal_entry_id": str(entry.id),
        "allocation_date": entry.entry_date.isoformat(),
        "description": entry.description,
        "profit_kurus": profit_kurus,
    }
