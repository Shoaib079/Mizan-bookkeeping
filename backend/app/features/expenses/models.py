"""Daily expense persistence — items, aliases, entries (Decisions §7, §22)."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow


class ExpenseEntryStatus(str, enum.Enum):
    NEEDS_REVIEW = "needs_review"
    POSTED = "posted"


class ExpenseItem(EntityScopedMixin, Base):
    __tablename__ = "expense_items"
    __table_args__ = (
        UniqueConstraint(
            "entity_id",
            "canonical_name_normalized",
            name="uq_expense_items_entity_canonical_normalized",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    canonical_name: Mapped[str] = mapped_column(String(512), nullable=False)
    canonical_name_normalized: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class ExpenseItemAlias(EntityScopedMixin, Base):
    __tablename__ = "expense_item_aliases"
    __table_args__ = (
        UniqueConstraint(
            "entity_id",
            "alias_normalized",
            name="uq_expense_item_aliases_entity_alias",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alias_normalized: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    expense_item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("expense_items.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class ExpenseEntry(EntityScopedMixin, Base):
    __tablename__ = "expense_entries"
    __table_args__ = (
        UniqueConstraint("journal_entry_id", name="uq_expense_entries_journal_entry_id"),
        UniqueConstraint(
            "entity_id",
            "source_document_fingerprint",
            name="uq_expense_entries_entity_source_fingerprint",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    expense_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    money_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("money_accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    written_item_description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    expense_item_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("expense_items.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    status: Mapped[ExpenseEntryStatus] = mapped_column(
        Enum(
            ExpenseEntryStatus,
            name="expense_entry_status",
            native_enum=False,
            length=16,
        ),
        nullable=False,
    )
    has_source_document: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(512), nullable=True)
    actor_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=True,
        unique=True,
        index=True,
    )
    bank_statement_line_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bank_statement_lines.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    review_reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    candidate_expense_item_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("expense_items.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    # Slice C: an expense read from an uploaded photo (e.g. a cash tip). The
    # fingerprint dedupes re-uploads per entity; the path points at the stored image.
    source_document_fingerprint: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    source_document_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
