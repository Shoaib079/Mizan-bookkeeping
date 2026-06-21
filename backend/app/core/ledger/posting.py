"""Single posting boundary — all ledger writes go through post_journal_entry (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import (
    ImmutableJournalError,
    JournalEntry,
    JournalEntryLine,
    JournalEntrySource,
    JournalEntryStatus,
    LedgerAuditAction,
    LedgerAuditEvent,
    journal_void_update_allowed,
)
from app.core.money import Kurus
from app.db.base import utcnow
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


class EntryNotFoundError(PostingError):
    """Journal entry missing for this entity."""


class AlreadyVoidedError(PostingError):
    """Entry was already voided."""


class NotVoidableError(PostingError):
    """Entry cannot be voided (e.g. reversal entry)."""


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


def _opposite_side(side: AccountNormalBalance) -> AccountNormalBalance:
    if side == AccountNormalBalance.DEBIT:
        return AccountNormalBalance.CREDIT
    return AccountNormalBalance.DEBIT


def _validate_accounts(
    session: Session, entity_id: uuid.UUID, lines: list[PostingLine]
) -> dict[uuid.UUID, Account]:
    account_ids = {line.account_id for line in lines}
    with posting_account_lookup(session):
        accounts = list(session.scalars(select(Account).where(Account.id.in_(account_ids))))
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

    return account_by_id


def _persist_journal_entry(
    session: Session,
    entry_date: date,
    description: str,
    lines: list[PostingLine],
    *,
    source: JournalEntrySource,
    reverses_entry_id: uuid.UUID | None = None,
) -> JournalEntry:
    entry = JournalEntry(
        entry_date=entry_date,
        description=description,
        source=source,
        reverses_entry_id=reverses_entry_id,
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

    session.flush()
    return entry


def _record_audit_event(
    session: Session,
    journal_entry_id: uuid.UUID,
    action: LedgerAuditAction,
    actor_id: uuid.UUID,
    reason: str | None = None,
) -> LedgerAuditEvent:
    event = LedgerAuditEvent(
        journal_entry_id=journal_entry_id,
        action=action,
        actor_id=actor_id,
        reason=reason,
    )
    session.add(event)
    return event


def post_journal_entry(
    session: Session,
    entity_id: uuid.UUID,
    entry_date: date,
    description: str,
    lines: list[PostingLine],
    *,
    actor_id: uuid.UUID,
    source: JournalEntrySource,
) -> JournalEntry:
    """The ONE posting boundary. Requires entity_context(entity_id) via wrapper."""
    validate_posting_lines(lines)

    with entity_context(session, entity_id):
        require_entity_context()
        _validate_accounts(session, entity_id, lines)

        entry = _persist_journal_entry(
            session, entry_date, description, lines, source=source
        )
        _record_audit_event(session, entry.id, LedgerAuditAction.POST, actor_id)

        session.commit()
        session.refresh(entry)
        _ = list(entry.lines)
        return entry


def void_journal_entry(
    session: Session,
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
) -> tuple[JournalEntry, JournalEntry]:
    """Void a posted entry by posting a balanced reversing entry linked to the original."""
    with entity_context(session, entity_id):
        require_entity_context()

        original = session.get(JournalEntry, entry_id)
        if original is None:
            raise EntryNotFoundError(f"journal entry {entry_id} not found")
        if original.status == JournalEntryStatus.VOIDED:
            raise AlreadyVoidedError(f"journal entry {entry_id} is already voided")
        if original.reverses_entry_id is not None:
            raise NotVoidableError("reversal entries cannot be voided directly")

        _ = list(original.lines)
        reversal_lines = [
            PostingLine(
                account_id=line.account_id,
                amount_kurus=line.amount_kurus,
                side=_opposite_side(line.side),
            )
            for line in original.lines
        ]
        validate_posting_lines(reversal_lines)
        _validate_accounts(session, entity_id, reversal_lines)

        effective_void_date = void_date or date.today()
        reversal = _persist_journal_entry(
            session,
            effective_void_date,
            f"Void: {original.description}",
            reversal_lines,
            source=JournalEntrySource.SYSTEM,
            reverses_entry_id=original.id,
        )
        _record_audit_event(
            session, reversal.id, LedgerAuditAction.POST, actor_id, reason=reason
        )

        with journal_void_update_allowed(session):
            original.status = JournalEntryStatus.VOIDED
            original.reversed_by_entry_id = reversal.id
            original.voided_at = utcnow()
            _record_audit_event(
                session, original.id, LedgerAuditAction.VOID, actor_id, reason=reason
            )
            session.commit()
            session.refresh(original)
            session.refresh(reversal)
            _ = list(reversal.lines)
            return original, reversal
