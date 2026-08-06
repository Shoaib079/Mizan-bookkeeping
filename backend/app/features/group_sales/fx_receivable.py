"""FX-denominated customer receivable helpers."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

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
    # Discount write-offs store a negative total_forex_minor, so they reduce the balance.
    discounts = session.scalar(
        select(func.coalesce(func.sum(CustomerLedgerEntry.total_forex_minor), 0)).where(
            CustomerLedgerEntry.customer_id == customer_id,
            CustomerLedgerEntry.forex_currency == forex_currency,
            CustomerLedgerEntry.movement_type == CustomerMovementType.DISCOUNT,
        )
    )
    return int(sales or 0) + int(discounts or 0) - int(payments or 0)


def outstanding_by_currency(
    session: Session,
    customer_id: uuid.UUID,
) -> list[tuple[str, int]]:
    """Every currency this customer still owes in, and how much.

    An agency can owe USD on one booking and EUR on another, so a single
    figure cannot describe them — the caller gets one line per currency,
    highest first, with settled currencies dropped.

    The TRY book balance is unaffected and remains the ledger's truth. This is
    what the customer agreed to pay, which is what they will hand over; the
    lira equivalent moves with the rate until they do.
    """
    currencies = session.scalars(
        select(CustomerLedgerEntry.forex_currency)
        .where(
            CustomerLedgerEntry.customer_id == customer_id,
            CustomerLedgerEntry.forex_currency.is_not(None),
        )
        .distinct()
    ).all()

    balances = [
        (currency, native_balance_for_currency(session, customer_id, currency))
        for currency in sorted(c for c in currencies if c)
    ]
    return [(currency, minor) for currency, minor in balances if minor != 0]


def outstanding_by_currency_for_customers(
    session: Session,
    customer_ids: Sequence[uuid.UUID],
) -> dict[uuid.UUID, list[tuple[str, int]]]:
    """`outstanding_by_currency` for many customers, in a single query.

    The per-customer version runs one query to find the currencies and another
    per currency. That is fine for a detail page and wrong for a directory:
    the receivables list loads up to 200 customers at once, which would be
    several hundred round trips to render one table.

    The arithmetic below must stay identical to `native_balance_for_currency`
    — same movement types, same `amount_kurus > 0` guard on sales, discounts
    added because they are stored negative. A test asserts the two agree on
    the same data rather than trusting that they look similar.
    """
    if not customer_ids:
        return {}

    sales = func.coalesce(
        func.sum(CustomerLedgerEntry.total_forex_minor).filter(
            CustomerLedgerEntry.movement_type == CustomerMovementType.CREDIT_SALE,
            CustomerLedgerEntry.amount_kurus > 0,
        ),
        0,
    )
    discounts = func.coalesce(
        func.sum(CustomerLedgerEntry.total_forex_minor).filter(
            CustomerLedgerEntry.movement_type == CustomerMovementType.DISCOUNT,
        ),
        0,
    )
    payments = func.coalesce(
        func.sum(CustomerLedgerEntry.payment_native_quantity).filter(
            CustomerLedgerEntry.movement_type == CustomerMovementType.PAYMENT_RECEIVED,
        ),
        0,
    )
    outstanding = sales + discounts - payments

    rows = session.execute(
        select(
            CustomerLedgerEntry.customer_id,
            CustomerLedgerEntry.forex_currency,
            outstanding.label("outstanding"),
        )
        .where(
            CustomerLedgerEntry.customer_id.in_(customer_ids),
            CustomerLedgerEntry.forex_currency.is_not(None),
        )
        .group_by(
            CustomerLedgerEntry.customer_id,
            CustomerLedgerEntry.forex_currency,
        )
        # Settled currencies drop out, exactly as the per-customer version does
        # before returning.
        .having(outstanding != 0)
        .order_by(
            CustomerLedgerEntry.customer_id,
            CustomerLedgerEntry.forex_currency,
        )
    ).all()

    grouped: dict[uuid.UUID, list[tuple[str, int]]] = {}
    for customer_id, currency, minor in rows:
        if currency is None:
            continue
        grouped.setdefault(customer_id, []).append((currency, int(minor or 0)))
    return grouped


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
    """TRY and native remaining for one posted group sale.

    Both payments and discount write-offs reduce the receivable, so both are netted here.
    """
    # Payments and discounts both credit AR (negative amount_kurus) → both reduce remaining.
    reduced_try = session.scalar(
        select(func.coalesce(func.sum(-CustomerLedgerEntry.amount_kurus), 0)).where(
            CustomerLedgerEntry.reference_type == "group_sale",
            CustomerLedgerEntry.reference_id == group_sale.id,
            CustomerLedgerEntry.movement_type.in_(
                (
                    CustomerMovementType.PAYMENT_RECEIVED,
                    CustomerMovementType.DISCOUNT,
                )
            ),
        )
    )
    remaining_native = None
    if group_sale.total_forex_minor is not None:
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
        # Discount native is stored as a negative total_forex_minor, so subtracting it reduces remaining.
        discount_native = int(
            session.scalar(
                select(func.coalesce(func.sum(-CustomerLedgerEntry.total_forex_minor), 0)).where(
                    CustomerLedgerEntry.reference_type == "group_sale",
                    CustomerLedgerEntry.reference_id == group_sale.id,
                    CustomerLedgerEntry.movement_type == CustomerMovementType.DISCOUNT,
                )
            )
            or 0
        )
        remaining_native = group_sale.total_forex_minor - paid_native - discount_native
    remaining_kurus = group_sale.total_kurus - int(reduced_try or 0)
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
