"""GS-FX customer payment routing — zero-cost FX wallet receipt, no GL."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.receivables import forex_only_posting
from app.core.receivables import ledger as receivables_ledger
from app.db.session import entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.customers.schema import CustomerPaymentCreate, CustomerPaymentResponse
from app.features.group_sales.fx_receivable import (
    has_forex_only_receivable,
    native_balance_for_currency,
)


def forex_overpayment_warning(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    payload: CustomerPaymentCreate,
) -> str | None:
    """Warn when a native forex receipt exceeds outstanding (any payment path)."""
    if payload.amount_kurus is None or payload.payment_native_quantity is None:
        return None

    with entity_context(session, entity_id):
        money_account = session.scalar(
            select(MoneyAccount).where(
                MoneyAccount.gl_account_id == payload.payment_account_id,
            )
        )
        if money_account is None:
            return None
        if money_account.account_kind != MoneyAccountKind.FOREIGN_CURRENCY:
            return None
        currency = money_account.currency
        if not currency:
            return None
        outstanding = native_balance_for_currency(session, customer_id, currency)

    if payload.payment_native_quantity <= outstanding:
        return None

    ahead = payload.payment_native_quantity - outstanding
    return (
        f"Receipt of {payload.payment_native_quantity / 100:.2f} {currency} "
        f"exceeds the {outstanding / 100:.2f} {currency} outstanding; "
        f"the customer is now {ahead / 100:.2f} {currency} paid ahead."
    )


def resolve_forex_only_payment_context(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    payload: CustomerPaymentCreate,
) -> tuple[str, MoneyAccount] | None:
    """When paying a GS-FX receivable in native currency with no TRY/GL."""
    with entity_context(session, entity_id):
        money_account = session.scalar(
            select(MoneyAccount).where(
                MoneyAccount.gl_account_id == payload.payment_account_id,
            )
        )
        if money_account is None:
            return None
        if money_account.account_kind != MoneyAccountKind.FOREIGN_CURRENCY:
            return None
        currency = money_account.currency
        if not currency:
            return None
        if not has_forex_only_receivable(session, customer_id, currency):
            return None
        if payload.payment_native_quantity is None or payload.payment_native_quantity <= 0:
            raise ValueError(
                "payment_native_quantity is required for forex-only receivable payments"
            )
        if payload.amount_kurus is not None:
            raise ValueError(
                "amount_kurus must not be set when paying a forex-only receivable"
            )
        return currency, money_account


def try_record_forex_only_customer_payment(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    payload: CustomerPaymentCreate,
    *,
    warning: str | None,
) -> CustomerPaymentResponse | None:
    """Post a forex-only payment when context matches; otherwise return None."""
    forex_only = resolve_forex_only_payment_context(
        session, entity_id, customer_id, payload
    )
    if forex_only is None:
        return None

    currency, money_account = forex_only
    reference_type = None
    reference_id = None
    if payload.group_sale_id is not None:
        reference_type = "group_sale"
        reference_id = payload.group_sale_id

    result = forex_only_posting.post_forex_only_customer_payment(
        session,
        entity_id,
        customer_id,
        payment_date=payload.payment_date,
        description=payload.description,
        actor_id=payload.actor_id,
        fx_money_account_id=money_account.id,
        payment_native_quantity=payload.payment_native_quantity,
        forex_currency=currency,
        reference_type=reference_type,
        reference_id=reference_id,
    )
    balance = receivables_ledger.current_balance_kurus(session, entity_id, customer_id)

    from app.features.customers.service import _customer_entry_read

    return CustomerPaymentResponse(
        journal_entry_id=None,
        customer_ledger_entry=_customer_entry_read(
            session, result.customer_ledger_entry, entity_id=entity_id
        ),
        balance_kurus=balance,
        warnings=[warning] if warning else [],
    )
