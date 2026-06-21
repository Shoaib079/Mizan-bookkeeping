"""Single posting boundary — all ledger writes go through post_journal_entry (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine
from app.core.money import Kurus
from app.db.session import entity_context, posting_account_lookup, require_entity_context


class PostingError(ValueError):
    """Base posting validation failure."""


class UnbalancedEntryError(PostingError):
    """Debits do not equal credits."""


class ZeroAmountError(PostingError):
    """Line amount must be positive kuruş."""


class InvalidAccountError(PostingError):
    """Account missing, inactive, or not in chart."""


class EntityMismatchError(PostingError):
    """Account or line belongs to a different entity."""


@dataclass(frozen=True, slots=True)
class PostingLine:
    account_id: uuid.UUID
    amount_kurus: Kurus
    side: AccountNormalBalance


def validate_posting_lines(lines: list[PostingLine]) -> None:
    """Pure validation: integer kuruş, no zero lines, debits = credits."""
    if len(lines) < 2:
        raise PostingError("at least two journal lines are required")

    debits = 0
    credits = 0
    for line in lines:
        if line.amount_kurus <= 0:
            raise ZeroAmountError(f"line amount must be positive kuruş, got {line.amount_kurus}")
        if line.side not in (AccountNormalBalance.DEBIT, AccountNormalBalance.CREDIT):
            raise PostingError(f"invalid side: {line.side}")
        if line.side == AccountNormalBalance.DEBIT:
            debits += line.amount_kurus
        else:
            credits += line.amount_kurus

    if debits != credits:
        raise UnbalancedEntryError(
            f"debits ({debits}) must equal credits ({credits}) in kuruş"
        )


def post_journal_entry(
    session: Session,
    entity_id: uuid.UUID,
    entry_date: date,
    description: str,
    lines: list[PostingLine],
) -> JournalEntry:
    """The ONE posting boundary. Requires entity_context(entity_id) via wrapper."""
    validate_posting_lines(lines)

    with entity_context(session, entity_id):
        require_entity_context()

        account_ids = {line.account_id for line in lines}
        with posting_account_lookup(session):
            accounts = list(
                session.scalars(select(Account).where(Account.id.in_(account_ids)))
            )
        account_by_id = {account.id: account for account in accounts}

        if len(account_by_id) != len(account_ids):
            missing = account_ids - account_by_id.keys()
            raise InvalidAccountError(f"unknown account id(s): {missing}")

        for line in lines:
            account = account_by_id[line.account_id]
            if account.entity_id != entity_id:
                raise EntityMismatchError(
                    f"account {account.code} belongs to entity {account.entity_id}, "
                    f"not {entity_id}"
                )
            if not account.is_active:
                raise InvalidAccountError(f"account {account.code} is not active")

        entry = JournalEntry(
            entry_date=entry_date,
            description=description,
        )
        session.add(entry)
        session.flush()

        for index, line in enumerate(lines, start=1):
            session.add(
                JournalEntryLine(
                    journal_entry_id=entry.id,
                    account_id=line.account_id,
                    amount_kurus=line.amount_kurus,
                    side=line.side,
                    line_number=index,
                )
            )

        session.commit()
        session.refresh(entry)
        # Eager-load lines while entity context is still active (RLS filters lazy loads).
        _ = list(entry.lines)
        return entry
