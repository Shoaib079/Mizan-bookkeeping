"""Bank statement persistence — import + classification (Decisions §12)."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, Enum, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow


class StatementLineClassification(str, enum.Enum):
    UNCLASSIFIED = "unclassified"
    SUPPLIER_PAYMENT = "supplier_payment"
    TRANSFER = "transfer"
    BANK_FEE = "bank_fee"
    UNKNOWN = "unknown"


class StatementLineStatus(str, enum.Enum):
    IMPORTED = "imported"
    CLASSIFIED = "classified"
    POSTED = "posted"
    LINKED = "linked"


class BankStatement(EntityScopedMixin, Base):
    __tablename__ = "bank_statements"
    __table_args__ = (
        UniqueConstraint(
            "entity_id",
            "file_fingerprint",
            name="uq_bank_statements_entity_fingerprint",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    money_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("money_accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    file_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    line_count: Mapped[int] = mapped_column(Integer, nullable=False)
    imported_at: Mapped[datetime] = mapped_column(default=utcnow)


class BankStatementLine(EntityScopedMixin, Base):
    __tablename__ = "bank_statement_lines"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    statement_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bank_statements.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    classification: Mapped[StatementLineClassification] = mapped_column(
        Enum(
            StatementLineClassification,
            name="statement_line_classification",
            native_enum=False,
            length=32,
        ),
        nullable=False,
        default=StatementLineClassification.UNCLASSIFIED,
    )
    status: Mapped[StatementLineStatus] = mapped_column(
        Enum(
            StatementLineStatus,
            name="statement_line_status",
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=StatementLineStatus.IMPORTED,
    )
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    supplier_ledger_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("supplier_ledger_entries.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    account_transfer_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("account_transfers.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
