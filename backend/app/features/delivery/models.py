"""Delivery platform report and settlement persistence (Decisions §9)."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, Index, Integer, String, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow


class DeliveryReportStatus(str, enum.Enum):
    DRAFT = "draft"
    NEEDS_REVIEW = "needs_review"
    POSTED = "posted"
    REJECTED = "rejected"


class DeliveryReport(EntityScopedMixin, Base):
    __tablename__ = "delivery_reports"
    __table_args__ = (
        UniqueConstraint(
            "entity_id",
            "file_fingerprint",
            name="uq_delivery_reports_entity_fingerprint",
        ),
        Index(
            "uq_delivery_reports_entity_platform_date_posted",
            "entity_id",
            "platform",
            "report_date",
            unique=True,
            postgresql_where=text("status = 'posted'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    platform: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    report_date: Mapped[date] = mapped_column(Date, nullable=False)
    gross_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    commission_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    net_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DeliveryReportStatus.DRAFT.value
    )
    file_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    review_reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=True,
        unique=True,
        index=True,
    )
    commission_journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=True,
        unique=True,
        index=True,
    )
    posted_at: Mapped[datetime | None] = mapped_column(nullable=True)
    posted_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class DeliverySettlement(EntityScopedMixin, Base):
    __tablename__ = "delivery_settlements"
    __table_args__ = (
        UniqueConstraint("journal_entry_id", name="uq_delivery_settlements_journal_entry_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    platform: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
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
    delivery_report_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("delivery_reports.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
