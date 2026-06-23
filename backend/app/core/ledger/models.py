"""Journal entry models — entity-scoped double-entry (Decisions §1, CURSOR_RULES §1 #10)."""

from __future__ import annotations

import enum
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date, datetime

from sqlalchemy import Date, Enum, ForeignKey, Integer, String, Uuid, event, text
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship

from app.core.chart_of_accounts.types import AccountNormalBalance
from app.db.base import Base, EntityScopedMixin, utcnow

_allow_journal_void_update: ContextVar[bool] = ContextVar("allow_journal_void_update", default=False)


class ImmutableJournalError(RuntimeError):
    """Posted journal records cannot be edited or deleted."""


@contextmanager
def journal_void_update_allowed(session: Session | None = None):
    """Allow void-related updates on an otherwise immutable journal entry."""
    token = _allow_journal_void_update.set(True)
    if session is not None:
        session.execute(text("SELECT set_config('app.journal_void_update', '1', true)"))
    try:
        yield
    finally:
        if session is not None:
            session.execute(text("SELECT set_config('app.journal_void_update', '', true)"))
        _allow_journal_void_update.reset(token)


class JournalEntryStatus(str, enum.Enum):
    POSTED = "posted"
    VOIDED = "voided"


class JournalEntrySource(str, enum.Enum):
    MANUAL = "manual"
    OPENING_BALANCE = "opening_balance"
    INVOICE = "invoice"
    PAYMENT = "payment"
    TRANSFER = "transfer"
    POS_SETTLEMENT = "pos_settlement"
    CARD_SALES = "card_sales"
    DELIVERY_REPORT = "delivery_report"
    DELIVERY_SETTLEMENT = "delivery_settlement"
    DELIVERY_COMMISSION = "delivery_commission"
    BANK_FEE = "bank_fee"
    CREDIT_CARD_PAYMENT = "credit_card_payment"
    CASH_MOVEMENT = "cash_movement"
    CASH_DRAWER_CLOSE = "cash_drawer_close"
    FX_PURCHASE = "fx_purchase"
    STAFF_ACCRUAL = "staff_accrual"
    STAFF_ADVANCE = "staff_advance"
    STAFF_PAYMENT = "staff_payment"
    PARTNER_EXPENSE_FRONTED = "partner_expense_fronted"
    PARTNER_REIMBURSEMENT_PAID = "partner_reimbursement_paid"
    CUSTOMER_CREDIT_SALE = "customer_credit_sale"
    CUSTOMER_PAYMENT_RECEIVED = "customer_payment_received"
    FX_CONVERSION = "fx_conversion"
    FX_EXPENSE_SPEND = "fx_expense_spend"
    TIP_ACCRUAL = "tip_accrual"
    TIP_PAYOUT = "tip_payout"
    EXPENSE_ENTRY = "expense_entry"
    SYSTEM = "system"


class LedgerAuditAction(str, enum.Enum):
    POST = "post"
    VOID = "void"
    AMEND = "amend"


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
    source: Mapped[JournalEntrySource] = mapped_column(
        Enum(JournalEntrySource, name="journal_entry_source", native_enum=False, length=32),
        nullable=False,
        default=JournalEntrySource.MANUAL,
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
    amends_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    amended_by_entry_id: Mapped[uuid.UUID | None] = mapped_column(
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
    amends_entry: Mapped["JournalEntry | None"] = relationship(
        foreign_keys=[amends_entry_id],
        remote_side="JournalEntry.id",
    )
    amended_by_entry: Mapped["JournalEntry | None"] = relationship(
        foreign_keys=[amended_by_entry_id],
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
