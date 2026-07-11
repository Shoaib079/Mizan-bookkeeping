"""POS persistence — card sales batches, settlements, daily summaries (Decisions §9, §13)."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, ForeignKey, Index, Integer, String, UniqueConstraint, text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow


class PosDailySummaryStatus(str, enum.Enum):
    DRAFT = "draft"
    NEEDS_REVIEW = "needs_review"
    CONFIRMED = "confirmed"
    POSTED = "posted"
    REJECTED = "rejected"
    VOIDED = "voided"


class CardSalesBatch(EntityScopedMixin, Base):
    __tablename__ = "card_sales_batches"
    __table_args__ = (
        UniqueConstraint("journal_entry_id", name="uq_card_sales_batches_journal_entry_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sales_date: Mapped[date] = mapped_column(Date, nullable=False)
    gross_amount_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class PosSettlement(EntityScopedMixin, Base):
    __tablename__ = "pos_settlements"
    __table_args__ = (
        UniqueConstraint("journal_entry_id", name="uq_pos_settlements_journal_entry_id"),
        UniqueConstraint(
            "card_sales_batch_id",
            name="uq_pos_settlements_card_sales_batch_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    money_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("money_accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    settlement_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
        index=True,
    )
    reference_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    bank_statement_line_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bank_statement_lines.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    commission_kurus: Mapped[int | None] = mapped_column(Integer, nullable=True)
    commission_inferred: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    card_sales_batch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("card_sales_batches.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class PosDailySummary(EntityScopedMixin, Base):
    __tablename__ = "pos_daily_summaries"
    __table_args__ = (
        UniqueConstraint(
            "entity_id",
            "file_fingerprint",
            name="uq_pos_daily_summaries_entity_fingerprint",
        ),
        Index(
            "uq_pos_daily_summaries_entity_date_posted",
            "entity_id",
            "summary_date",
            unique=True,
            postgresql_where=text("status = 'posted'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status: Mapped[PosDailySummaryStatus] = mapped_column(
        String(32), nullable=False, default=PosDailySummaryStatus.DRAFT
    )
    file_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    summary_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    cash_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    card_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    total_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    z_report_kurus: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confirmed_cash_kurus: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confirmed_card_kurus: Mapped[int | None] = mapped_column(Integer, nullable=True)
    extraction_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    review_reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    money_account_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("money_accounts.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    posted_at: Mapped[datetime | None] = mapped_column(nullable=True)
    posted_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    card_sales_batch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("card_sales_batches.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    cash_movement_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("cash_movements.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
