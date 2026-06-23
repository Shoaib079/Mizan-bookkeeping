"""Customer feature service — master data + posting wrappers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.core.ledger.correction import CorrectionNotFoundError, correct_customer_payment
from app.core.receivables import ledger as receivables_ledger
from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables import posting as receivables_posting
from app.db.session import entity_context, require_entity_context
from app.features.customers.models import Customer
from app.features.customers.schema import (
    CreditSaleCreate,
    CreditSaleResponse,
    CustomerCreate,
    CustomerLedgerEntryRead,
    CustomerLedgerRead,
    CustomerPaymentCreate,
    CustomerPaymentCorrect,
    CustomerPaymentCorrectOut,
    CustomerPaymentResponse,
    CustomerUpdate,
)
from app.features.entities import service as entity_service


def create_customer(
    session: Session, entity_id: uuid.UUID, payload: CustomerCreate
) -> Customer:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        customer = Customer(
            name=payload.name,
            identifier=payload.identifier,
            notes=payload.notes,
        )
        session.add(customer)
        session.commit()
        session.refresh(customer)
        return customer


def list_customers(
    session: Session,
    entity_id: uuid.UUID,
    *,
    include_inactive: bool = False,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[Customer], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if not include_inactive:
            filters.append(Customer.is_active.is_(True))
        search = text_search_filter(q, Customer.name, Customer.identifier)
        if search is not None:
            filters.append(search)
        stmt = select(Customer).where(*filters).order_by(Customer.name)
        return fetch_paginated(session, stmt, params)


def get_customer(
    session: Session, entity_id: uuid.UUID, customer_id: uuid.UUID
) -> Customer:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        customer = session.get(Customer, customer_id)
        if customer is None:
            raise LookupError("Customer not found")
        return customer


def update_customer(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
) -> Customer:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        customer = session.get(Customer, customer_id)
        if customer is None:
            raise LookupError("Customer not found")

        if payload.name is not None:
            customer.name = payload.name
        if payload.identifier is not None:
            customer.identifier = payload.identifier
        if payload.notes is not None:
            customer.notes = payload.notes
        if payload.is_active is not None:
            customer.is_active = payload.is_active

        session.commit()
        session.refresh(customer)
        return customer


def get_customer_ledger(
    session: Session, entity_id: uuid.UUID, customer_id: uuid.UUID
) -> CustomerLedgerRead:
    balance = receivables_ledger.current_balance_kurus(session, entity_id, customer_id)
    entries = receivables_ledger.list_ledger_entries(session, entity_id, customer_id)
    return CustomerLedgerRead(
        customer_id=customer_id,
        balance_kurus=balance,
        entries=[CustomerLedgerEntryRead.model_validate(e) for e in entries],
    )


def record_credit_sale(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    payload: CreditSaleCreate,
) -> CreditSaleResponse:
    result = receivables_posting.post_credit_sale(
        session,
        entity_id,
        customer_id,
        sale_date=payload.sale_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        revenue_account_id=payload.revenue_account_id,
    )
    return CreditSaleResponse(
        journal_entry_id=result.journal_entry.id,
        customer_ledger_entry=CustomerLedgerEntryRead.model_validate(
            result.customer_ledger_entry
        ),
        balance_kurus=result.balance_kurus,
    )


def record_customer_payment(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    payload: CustomerPaymentCreate,
) -> CustomerPaymentResponse:
    result = receivables_posting.post_customer_payment(
        session,
        entity_id,
        customer_id,
        payment_date=payload.payment_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
    )
    return CustomerPaymentResponse(
        journal_entry_id=result.journal_entry.id,
        customer_ledger_entry=CustomerLedgerEntryRead.model_validate(
            result.customer_ledger_entry
        ),
        balance_kurus=result.balance_kurus,
    )


def correct_customer_payment_entry(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: CustomerPaymentCreate,
    *,
    reason: str | None = None,
    void_date=None,
):
    with entity_context(session, entity_id):
        row = session.scalar(
            select(CustomerLedgerEntry).where(
                CustomerLedgerEntry.journal_entry_id == journal_entry_id
            )
        )
        if row is None or row.customer_id != customer_id:
            raise CorrectionNotFoundError("customer payment not found")

    result = correct_customer_payment(
        session,
        entity_id,
        journal_entry_id,
        payment_date=payload.payment_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
        reason=reason,
        void_date=void_date,
    )
    balance = receivables_ledger.current_balance_kurus(session, entity_id, customer_id)
    with entity_context(session, entity_id):
        new_row = session.scalar(
            select(CustomerLedgerEntry).where(
                CustomerLedgerEntry.journal_entry_id == result.corrected.id
            )
        )
    return result, balance, new_row
