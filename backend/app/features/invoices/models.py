"""Invoice draft persistence — entity-scoped, RLS (Decisions §7, §8)."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow


class InvoiceDraftStatus(str, enum.Enum):
    DRAFT = "draft"
    DUPLICATE = "duplicate"
    NEEDS_REVIEW = "needs_review"
    CONFIRMED = "confirmed"
    POSTED = "posted"
    REJECTED = "rejected"


class InvoiceSourceType(str, enum.Enum):
    EFATURA_XML = "efatura_xml"
    EFATURA_PDF = "efatura_pdf"


class InvoiceKind(str, enum.Enum):
    SUPPLIER = "supplier"
    SUPPLIER_CREDIT = "supplier_credit"
    DELIVERY_COMMISSION = "delivery_commission"


class InvoiceDraft(EntityScopedMixin, Base):
    __tablename__ = "invoice_drafts"
    __table_args__ = (
        UniqueConstraint(
            "entity_id",
            "file_fingerprint",
            name="uq_invoice_drafts_entity_fingerprint",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status: Mapped[InvoiceDraftStatus] = mapped_column(
        String(32), nullable=False, default=InvoiceDraftStatus.DRAFT
    )
    invoice_kind: Mapped[str] = mapped_column(
        String(32), nullable=False, default=InvoiceKind.SUPPLIER.value
    )
    source_type: Mapped[InvoiceSourceType] = mapped_column(String(32), nullable=False)
    file_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    supplier_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    supplier_vkn: Mapped[str | None] = mapped_column(String(11), nullable=True)
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    delivery_platform_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("delivery_platforms.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    invoice_number: Mapped[str] = mapped_column(String(128), nullable=False)
    referenced_invoice_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    referenced_invoice_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False)
    net_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    gross_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    other_taxes_kurus: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    vat_breakdown: Mapped[list] = mapped_column(JSONB, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="TRY")
    extraction_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    confirmed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    posted_at: Mapped[datetime | None] = mapped_column(nullable=True)
    posted_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    review_reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
