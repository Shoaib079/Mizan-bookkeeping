"""Learned supplier→expense-account rules — entity-scoped, RLS."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow


class SupplierExpenseAccountRule(EntityScopedMixin, Base):
    __tablename__ = "supplier_expense_account_rules"
    __table_args__ = (
        UniqueConstraint(
            "entity_id",
            "supplier_id",
            name="uq_supplier_expense_account_rules_entity_supplier",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    expense_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    confirmation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    correction_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    confirmations_since_correction: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
