"""Credit card payment listing — bank pays company card liability (Decisions §12)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.listing import (
    ListParams,
    amount_range_filters,
    date_range_filters,
    fetch_paginated,
    text_search_filter,
)
from app.db.session import entity_context, require_entity_context
from app.features.banking.credit_card_payment_models import CreditCardPayment
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import CreditCardPaymentRead
from app.features.banking import service as banking_service
from app.features.entities import service as entity_service


class InvalidCreditCardAccountError(ValueError):
    """Money account is not a credit card."""


def _to_read(payment: CreditCardPayment) -> CreditCardPaymentRead:
    return CreditCardPaymentRead(
        id=payment.id,
        entity_id=payment.entity_id,
        credit_card_money_account_id=payment.credit_card_money_account_id,
        bank_money_account_id=payment.bank_money_account_id,
        payment_date=payment.payment_date,
        amount_kurus=payment.amount_kurus,
        description=payment.description,
        actor_id=payment.actor_id,
        journal_entry_id=payment.journal_entry_id,
        bank_statement_line_id=payment.bank_statement_line_id,
        created_at=payment.created_at,
    )


def list_credit_card_payments(
    session: Session,
    entity_id: uuid.UUID,
    credit_card_money_account_id: uuid.UUID,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    min_amount: int | None = None,
    max_amount: int | None = None,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[CreditCardPaymentRead], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    account = banking_service.get_money_account(
        session, entity_id, credit_card_money_account_id
    )
    if account.account_kind != MoneyAccountKind.CREDIT_CARD:
        raise InvalidCreditCardAccountError("Money account is not a credit card")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = [
            CreditCardPayment.credit_card_money_account_id == credit_card_money_account_id,
        ]
        filters.extend(
            date_range_filters(
                CreditCardPayment.payment_date,
                from_date=from_date,
                to_date=to_date,
            )
        )
        filters.extend(
            amount_range_filters(
                CreditCardPayment.amount_kurus,
                min_amount=min_amount,
                max_amount=max_amount,
            )
        )
        search = text_search_filter(q, CreditCardPayment.description)
        if search is not None:
            filters.append(search)
        stmt = (
            select(CreditCardPayment)
            .where(*filters)
            .order_by(
                CreditCardPayment.payment_date.desc(),
                CreditCardPayment.created_at.desc(),
            )
        )
        rows, total = fetch_paginated(session, stmt, params)
        return [_to_read(row) for row in rows], total
