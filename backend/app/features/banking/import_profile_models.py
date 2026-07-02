"""Saved bank statement import column profiles — one per bank money account."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow


class BankImportProfile(EntityScopedMixin, Base):
    __tablename__ = "bank_import_profiles"
    __table_args__ = (
        UniqueConstraint(
            "entity_id",
            "money_account_id",
            name="uq_bank_import_profiles_entity_account",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    money_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("money_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    header_row: Mapped[int] = mapped_column(Integer, nullable=False)
    data_start_row: Mapped[int] = mapped_column(Integer, nullable=False)
    data_end_row: Mapped[int | None] = mapped_column(Integer, nullable=True)
    date_col: Mapped[int] = mapped_column(Integer, nullable=False)
    description_col: Mapped[int] = mapped_column(Integer, nullable=False)
    description_extra_cols: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    reference_col: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amount_col: Mapped[int | None] = mapped_column(Integer, nullable=True)
    debit_col: Mapped[int | None] = mapped_column(Integer, nullable=True)
    credit_col: Mapped[int | None] = mapped_column(Integer, nullable=True)
    date_format: Mapped[str] = mapped_column(String(16), nullable=False)
    decimal_format: Mapped[str] = mapped_column(String(8), nullable=False, default="tr")
    debit_is_outflow: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    csv_encoding: Mapped[str] = mapped_column(String(16), nullable=False, default="auto")
    csv_delimiter: Mapped[str] = mapped_column(String(8), nullable=False, default="auto")
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
