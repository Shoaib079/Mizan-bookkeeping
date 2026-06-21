"""Account transfer persistence — own-account movements (Decisions §12)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow


class AccountTransfer(EntityScopedMixin, Base):
    __tablename__ = "account_transfers"
    __table_args__ = (
        UniqueConstraint("journal_entry_id", name="uq_account_transfers_journal_entry_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_money_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("money_accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    to_money_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("money_accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    amount_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    transfer_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
        index=True,
    )
    from_statement_line_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bank_statement_lines.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    to_statement_line_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bank_statement_lines.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
