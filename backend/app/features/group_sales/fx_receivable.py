"""FX-denominated customer receivable helpers."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables.types import CustomerMovementType
from app.features.group_sales.models import GroupSale


class FxReceivableError(ValueError):
    """FX receivable allocation failed."""


def native_balance_for_currency(
    session: Session,
    customer_id: uuid.UUID,
    forex_currency: str,
) -> int:
    """Outstanding native amount owed in one forex currency."""
    sales = session.scalar(
        select(func.coalesce(func.sum(CustomerLedgerEntry.total_forex_minor), 0)).where(
            CustomerLedgerEntry.customer_id == customer_id,
            CustomerLedgerEntry.forex_currency == forex_currency,
            CustomerLedgerEntry.movement_type == CustomerMovementType.CREDIT_SALE,
            CustomerLedgerEntry.amount_kurus > 0,
        )
    )
    payments = session.scalar(
        select(func.coalesce(func.sum(CustomerLedgerEntry.payment_native_quantity), 0)).where(
            CustomerLedgerEntry.customer_id == customer_id,
            CustomerLedgerEntry.forex_currency == forex_currency,
            CustomerLedgerEntry.movement_type == CustomerMovementType.PAYMENT_RECEIVED,
        )
    )
    return int(sales or 0) - int(payments or 0)


def try_balance_for_currency(
    session: Session,
    customer_id: uuid.UUID,
    forex_currency: str,
) -> int:
    """TRY book balance for forex-denominated receivable movements."""
    total = session.scalar(
        select(func.coalesce(func.sum(CustomerLedgerEntry.amount_kurus), 0)).where(
            CustomerLedgerEntry.customer_id == customer_id,
            CustomerLedgerEntry.forex_currency == forex_currency,
        )
    )
    return int(total or 0)


def remaining_on_group_sale(session: Session, group_sale: GroupSale) -> tuple[int, int | None]:
    """TRY and native remaining for one posted group sale."""
    paid_try = session.scalar(
        select(func.coalesce(func.sum(-CustomerLedgerEntry.amount_kurus), 0)).where(
            CustomerLedgerEntry.reference_type == "group_sale",
            CustomerLedgerEntry.reference_id == group_sale.id,
            CustomerLedgerEntry.movement_type == CustomerMovementType.PAYMENT_RECEIVED,
        )
    )
    paid_native = 0
    if group_sale.forex_currency:
        paid_native = int(
            session.scalar(
                select(func.coalesce(func.sum(CustomerLedgerEntry.payment_native_quantity), 0)).where(
                    CustomerLedgerEntry.reference_type == "group_sale",
                    CustomerLedgerEntry.reference_id == group_sale.id,
                    CustomerLedgerEntry.movement_type == CustomerMovementType.PAYMENT_RECEIVED,
                )
            )
            or 0
        )
    remaining_kurus = group_sale.total_kurus - int(paid_try or 0)
    remaining_native = None
    if group_sale.total_forex_minor is not None:
        remaining_native = group_sale.total_forex_minor - paid_native
    return remaining_kurus, remaining_native


def compute_try_payment_from_native(
    session: Session,
    customer_id: uuid.UUID,
    forex_currency: str,
    payment_native: int,
    *,
    group_sale_id: uuid.UUID | None = None,
) -> int:
    """Map native payment to TRY carrying value — no payment-date rate."""
    if payment_native <= 0:
        raise FxReceivableError("payment_native must be positive")

    if group_sale_id is not None:
        group_sale = session.get(GroupSale, group_sale_id)
        if group_sale is None or group_sale.customer_id != customer_id:
            raise FxReceivableError("group sale not found for customer")
        if group_sale.forex_currency != forex_currency:
            raise FxReceivableError("group sale currency does not match payment")
        if group_sale.total_forex_minor is None or group_sale.total_forex_minor <= 0:
            raise FxReceivableError("group sale has no forex balance")
        remaining_kurus, remaining_native = remaining_on_group_sale(session, group_sale)
        if remaining_native is None or remaining_native <= 0:
            raise FxReceivableError("group sale has no remaining forex balance")
        if payment_native > remaining_native:
            raise FxReceivableError("payment exceeds remaining forex balance for this sale")
        return round(payment_native * remaining_kurus / remaining_native)

    native_out = native_balance_for_currency(session, customer_id, forex_currency)
    if native_out <= 0:
        raise FxReceivableError("no forex receivable balance for this currency")
    if payment_native > native_out:
        raise FxReceivableError("payment exceeds forex receivable balance")
    try_out = try_balance_for_currency(session, customer_id, forex_currency)
    if try_out <= 0:
        raise FxReceivableError("no TRY carrying value on forex receivable")
    return round(payment_native * try_out / native_out)
