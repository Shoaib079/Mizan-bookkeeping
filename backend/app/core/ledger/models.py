"""Journal entry models — entity-scoped double-entry (Decisions §1, CURSOR_RULES §1 #10)."""

from __future__ import annotations

import enum
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date, datetime

from sqlalchemy import Date, Enum, ForeignKey, Integer, String, Uuid, event
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.chart_of_accounts.types import AccountNormalBalance
from app.db.base import Base, EntityScopedMixin, utcnow

_allow_journal_void_update: ContextVar[bool] = ContextVar("allow_journal_void_update", default=False)


class ImmutableJournalError(RuntimeError):
    """Posted journal records cannot be edited or deleted."""


@contextmanager
def journal_void_update_allowed():
    """Allow void-related updates on an otherwise immutable journal entry."""
    token = _allow_journal_void_update.set(True)
    try:
        yield
    finally:
        _allow_journal_void_update.reset(token)


class JournalEntryStatus(str, enum.Enum):
    POSTED = "posted"
    VOIDED = "voided"


class LedgerAuditAction(str, enum.Enum):
    POST = "post"
    VOID = "void"


class JournalEntry(EntityScopedMixin, Base):
    __tablename__ = "journal_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    status: Mapped[JournalEntryStatus] = mapped_column(
        Enum(JournalEntryStatus, name="journal_entry_status", native_enum=False, length=16),
        nullable=False,
        default=JournalEntryStatus.POSTED,
    )
    reverses_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    reversed_by_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    voided_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    lines: Mapped[list["JournalEntryLine"]] = relationship(
        back_populates="journal_entry",
        cascade="all, delete-orphan",
        order_by="JournalEntryLine.line_number",
    )
    reverses_entry: Mapped["JournalEntry | None"] = relationship(
        foreign_keys=[reverses_entry_id],
        remote_side="JournalEntry.id",
    )
    reversed_by_entry: Mapped["JournalEntry | None"] = relationship(
        foreign_keys=[reversed_by_entry_id],
        remote_side="JournalEntry.id",
    )


class JournalEntryLine(EntityScopedMixin, Base):
    __tablename__ = "journal_entry_lines"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    amount_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    side: Mapped[AccountNormalBalance] = mapped_column(
        Enum(AccountNormalBalance, name="journal_line_side", native_enum=False, length=8),
        nullable=False,
    )
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    journal_entry: Mapped["JournalEntry"] = relationship(back_populates="lines")


class LedgerAuditEvent(EntityScopedMixin, Base):
    __tablename__ = "ledger_audit_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    action: Mapped[LedgerAuditAction] = mapped_column(
        Enum(LedgerAuditAction, name="ledger_audit_action", native_enum=False, length=8),
        nullable=False,
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


@event.listens_for(JournalEntry, "before_update")
def _journal_entry_immutable(_mapper, _connection, target) -> None:
    if _allow_journal_void_update.get():
        return
    raise ImmutableJournalError("posted journal entries cannot be modified")


@event.listens_for(JournalEntry, "before_delete")
def _journal_entry_no_delete(_mapper, _connection, _target) -> None:
    raise ImmutableJournalError("journal entries cannot be deleted")


@event.listens_for(JournalEntryLine, "before_update")
def _journal_line_immutable(_mapper, _connection, _target) -> None:
    raise ImmutableJournalError("journal entry lines cannot be modified")


@event.listens_for(JournalEntryLine, "before_delete")
def _journal_line_no_delete(_mapper, _connection, _target) -> None:
    raise ImmutableJournalError("journal entry lines cannot be deleted")
