"""Money account persistence — entity-scoped bank/cash/credit-card sub-accounts (Decisions §12)."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Enum, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntityScopedMixin, utcnow


class MoneyAccountKind(str, enum.Enum):
    BANK = "bank"
    CASH = "cash"
    CREDIT_CARD = "credit_card"
    FOREIGN_CURRENCY = "foreign_currency"


BANK_BUCKET_CODE = "1100"
CASH_BUCKET_CODE = "1000"
CREDIT_CARD_BUCKET_CODE = "2100"

FX_BUCKET_CODE_BY_CURRENCY: dict[str, str] = {
    "USD": "1010",
    "EUR": "1020",
    "GBP": "1030",
}
SUPPORTED_FX_CURRENCIES = frozenset(FX_BUCKET_CODE_BY_CURRENCY)

BUCKET_CODE_BY_KIND: dict[MoneyAccountKind, str] = {
    MoneyAccountKind.BANK: BANK_BUCKET_CODE,
    MoneyAccountKind.CASH: CASH_BUCKET_CODE,
    MoneyAccountKind.CREDIT_CARD: CREDIT_CARD_BUCKET_CODE,
}


class MoneyAccount(EntityScopedMixin, Base):
    __tablename__ = "money_accounts"
    __table_args__ = (
        UniqueConstraint("entity_id", "name", name="uq_money_accounts_entity_name"),
        UniqueConstraint("gl_account_id", name="uq_money_accounts_gl_account_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_kind: Mapped[MoneyAccountKind] = mapped_column(
        Enum(MoneyAccountKind, name="money_account_kind", native_enum=False, length=16),
        nullable=False,
    )
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    gl_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    bank_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    iban: Mapped[str | None] = mapped_column(String(34), nullable=True)
    last_four: Mapped[str | None] = mapped_column(String(4), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
