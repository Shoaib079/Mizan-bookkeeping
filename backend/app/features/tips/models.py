"""Tips pass-through persistence (Decisions §9)."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, Enum, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow


class TipAccrualSource(str, enum.Enum):
    CARD = "card"
    CASH = "cash"


class TipAccrual(EntityScopedMixin, Base):
    __tablename__ = "tip_accruals"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    accrual_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[TipAccrualSource] = mapped_column(
        Enum(
            TipAccrualSource,
            name="tip_accrual_source",
            native_enum=False,
            length=8,
        ),
        nullable=False,
    )
    money_account_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("money_accounts.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
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


class TipPayout(EntityScopedMixin, Base):
    __tablename__ = "tip_payouts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payout_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    money_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("money_accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
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
