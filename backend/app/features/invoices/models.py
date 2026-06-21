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


class InvoiceSourceType(str, enum.Enum):
    EFATURA_XML = "efatura_xml"
    EFATURA_PDF = "efatura_pdf"


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
    invoice_number: Mapped[str] = mapped_column(String(128), nullable=False)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False)
    net_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    gross_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    vat_breakdown: Mapped[list] = mapped_column(JSONB, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="TRY")
    extraction_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
