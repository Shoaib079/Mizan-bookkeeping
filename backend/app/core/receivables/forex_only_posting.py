"""GS-FX — forex-only receivable posting (subledger only, no GL)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.core.fx.ledger import record_fx_movement
from app.core.fx.models import FxLedgerEntry
from app.core.fx.types import FxMovementType
from app.core.receivables import ledger as receivables_ledger
from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables.posting import InvalidReceivablePostingError, _get_customer
from app.core.receivables.types import CustomerMovementType
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.entities import service as entity_service
from app.features.group_sales.fx_receivable import native_balance_for_currency


@dataclass(frozen=True, slots=True)
class ForexOnlyCreditSalePostResult:
    customer_ledger_entry: CustomerLedgerEntry


@dataclass(frozen=True, slots=True)
class ForexOnlyCustomerPaymentPostResult:
    customer_ledger_entry: CustomerLedgerEntry
    fx_ledger_entry: FxLedgerEntry


def post_forex_only_credit_sale(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    *,
    sale_date: date,
    description: str,
    actor_id: uuid.UUID,
    forex_currency: str,
    total_forex_minor: int,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> ForexOnlyCreditSalePostResult:
    """Forex-only credit sale — subledger receivable only; no GL, no TRY revenue."""
    if total_forex_minor <= 0:
        raise ValueError("total_forex_minor must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_customer(session, entity_id, customer_id)

        customer_entry = receivables_ledger.persist_forex_only_customer_ledger_entry(
            session,
            customer_id,
            movement_date=sale_date,
            movement_type=CustomerMovementType.CREDIT_SALE,
            description=description,
            actor_id=actor_id,
            forex_currency=forex_currency,
            total_forex_minor=total_forex_minor,
            reference_type=reference_type,
            reference_id=reference_id,
        )

        session.commit()
        session.refresh(customer_entry)

        return ForexOnlyCreditSalePostResult(customer_ledger_entry=customer_entry)


def post_forex_only_customer_payment(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    *,
    payment_date: date,
    description: str,
    actor_id: uuid.UUID,
    fx_money_account_id: uuid.UUID,
    payment_native_quantity: int,
    forex_currency: str,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> ForexOnlyCustomerPaymentPostResult:
    """Forex-only payment — clears native receivable; zero-cost FX wallet receipt; no GL."""
    if payment_native_quantity <= 0:
        raise ValueError("payment_native_quantity must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_customer(session, entity_id, customer_id)

        money_account = session.get(MoneyAccount, fx_money_account_id)
        if money_account is None or money_account.entity_id != entity_id:
            raise InvalidReceivablePostingError("FX money account not found")
        if money_account.account_kind != MoneyAccountKind.FOREIGN_CURRENCY:
            raise InvalidReceivablePostingError("payment account must be an FX wallet")
        if money_account.currency != forex_currency:
            raise InvalidReceivablePostingError("FX wallet currency does not match receivable")

        native_out = native_balance_for_currency(session, customer_id, forex_currency)
        if payment_native_quantity > native_out:
            raise receivables_ledger.OverpaymentError(
                f"Payment of {payment_native_quantity} exceeds forex receivable {native_out}"
            )

        customer_entry = receivables_ledger.persist_forex_only_customer_ledger_entry(
            session,
            customer_id,
            movement_date=payment_date,
            movement_type=CustomerMovementType.PAYMENT_RECEIVED,
            description=description,
            actor_id=actor_id,
            forex_currency=forex_currency,
            payment_native_quantity=payment_native_quantity,
            reference_type=reference_type,
            reference_id=reference_id,
        )

        fx_entry = record_fx_movement(
            session,
            fx_money_account_id,
            movement_date=payment_date,
            movement_type=FxMovementType.RECEIPT,
            native_quantity=payment_native_quantity,
            try_cost_kurus=0,
            description=description,
            actor_id=actor_id,
            journal_entry_id=None,
        )

        session.commit()
        session.refresh(customer_entry)
        session.refresh(fx_entry)

        return ForexOnlyCustomerPaymentPostResult(
            customer_ledger_entry=customer_entry,
            fx_ledger_entry=fx_entry,
        )


@dataclass(frozen=True, slots=True)
class ForexOnlyDiscountPostResult:
    customer_ledger_entry: CustomerLedgerEntry


def post_forex_only_group_sale_discount(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    *,
    discount_date: date,
    description: str,
    actor_id: uuid.UUID,
    forex_currency: str,
    discount_native: int,
    group_sale_id: uuid.UUID,
) -> ForexOnlyDiscountPostResult:
    """Forex-only group sale discount — native receivable reduction; no GL."""
    if discount_native <= 0:
        raise ValueError("discount_native must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        _get_customer(session, entity_id, customer_id)

        native_out = native_balance_for_currency(session, customer_id, forex_currency)
        if discount_native > native_out:
            raise receivables_ledger.OverpaymentError(
                f"Discount of {discount_native} exceeds forex receivable {native_out}"
            )

        customer_entry = receivables_ledger.persist_forex_only_customer_ledger_entry(
            session,
            customer_id,
            movement_date=discount_date,
            movement_type=CustomerMovementType.DISCOUNT,
            description=description,
            actor_id=actor_id,
            forex_currency=forex_currency,
            total_forex_minor=-discount_native,
            reference_type="group_sale",
            reference_id=group_sale_id,
        )

        session.commit()
        session.refresh(customer_entry)

        return ForexOnlyDiscountPostResult(customer_ledger_entry=customer_entry)
