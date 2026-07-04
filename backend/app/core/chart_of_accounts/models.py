"""Persisted chart of accounts — entity-scoped (Decisions §1, Phase 1)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Enum, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.db.base import Base, EntityScopedMixin, utcnow


class Account(EntityScopedMixin, Base):
    __tablename__ = "accounts"
    __table_args__ = (UniqueConstraint("entity_id", "code", name="uq_accounts_entity_code"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(16), nullable=False)
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    name_tr: Mapped[str] = mapped_column(String(255), nullable=False)
    # Raw-SQL migrations MUST insert uppercase enum NAMES (EQUITY, CREDIT), not values.
    account_type: Mapped[AccountType] = mapped_column(
        Enum(AccountType, name="account_type", native_enum=False, length=16),
        nullable=False,
    )
    normal_balance: Mapped[AccountNormalBalance] = mapped_column(
        Enum(AccountNormalBalance, name="account_normal_balance", native_enum=False, length=8),
        nullable=False,
    )
    accepts_opening_balance: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    parent_account_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
