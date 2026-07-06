"""Customer feature service — master data + posting wrappers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.core.ledger.correction import (
    CorrectionNotFoundError,
    correct_credit_sale,
    correct_customer_payment,
    void_credit_sale,
    void_customer_payment,
)
from app.core.ledger.subledger_display import enrich_entry_models
from app.core.receivables import ledger as receivables_ledger
from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables import posting as receivables_posting
from app.core.duplicate_guard import (
    ensure_not_duplicate,
    find_duplicate_credit_sale,
)
from app.db.session import entity_context, require_entity_context
from app.features.customers.group_sale import (
    build_group_credit_sale_description,
    resolve_credit_sale_amount_kurus,
)
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


def _customer_entry_reads(
    session: Session, entries: list[CustomerLedgerEntry]
) -> list[CustomerLedgerEntryRead]:
    if not entries:
        return []
    return enrich_entry_models(
        session,
        CustomerLedgerEntryRead,
        entries,
        journal_entry_id=lambda entry: entry.journal_entry_id,
        description=lambda entry: entry.description,
    )


def _customer_entry_read(
    session: Session, entry: CustomerLedgerEntry, *, entity_id: uuid.UUID
) -> CustomerLedgerEntryRead:
    with entity_context(session, entity_id):
        require_entity_context()
        return _customer_entry_reads(session, [entry])[0]


def create_customer(
    session: Session, entity_id: uuid.UUID, payload: CustomerCreate
) -> Customer:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        customer = Customer(
            name=payload.name,
            identifier=payload.identifier,
            tax_id=payload.tax_id,
            contact_name=payload.contact_name,
            phone=payload.phone,
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
        search = text_search_filter(
            q,
            Customer.name,
            Customer.identifier,
            Customer.tax_id,
            Customer.contact_name,
            Customer.phone,
        )
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
        if payload.tax_id is not None:
            customer.tax_id = payload.tax_id or None
        if payload.contact_name is not None:
            customer.contact_name = payload.contact_name or None
        if payload.phone is not None:
            customer.phone = payload.phone or None
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
    with entity_context(session, entity_id):
        require_entity_context()
        balance = receivables_ledger.current_balance_kurus(session, entity_id, customer_id)
        entries = receivables_ledger.list_ledger_entries(session, entity_id, customer_id)
        reads = _customer_entry_reads(session, entries)
    return CustomerLedgerRead(
        customer_id=customer_id,
        balance_kurus=balance,
        entries=reads,
    )


def record_credit_sale(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    payload: CreditSaleCreate,
) -> CreditSaleResponse:
    amount_kurus = resolve_credit_sale_amount_kurus(payload)
    with entity_context(session, entity_id):
        require_entity_context()
        ensure_not_duplicate(
            find_duplicate_credit_sale(
                session,
                customer_id=customer_id,
                sale_date=payload.sale_date,
                amount_kurus=amount_kurus,
            ),
            acknowledged=payload.acknowledge_duplicate,
        )
    description = build_group_credit_sale_description(payload)
    total_forex_minor = payload.total_forex_minor
    result = receivables_posting.post_credit_sale(
        session,
        entity_id,
        customer_id,
        sale_date=payload.sale_date,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=payload.actor_id,
        revenue_account_id=payload.revenue_account_id,
        pax=payload.pax,
        rate_per_person_kurus=payload.rate_per_person_kurus,
        forex_currency=payload.forex_currency,
        rate_per_person_forex_minor=payload.rate_per_person_forex_minor,
        total_forex_minor=total_forex_minor,
    )
    return CreditSaleResponse(
        journal_entry_id=result.journal_entry.id,
        customer_ledger_entry=_customer_entry_read(
            session, result.customer_ledger_entry, entity_id=entity_id
        ),
        balance_kurus=result.balance_kurus,
    )


def record_customer_payment(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    payload: CustomerPaymentCreate,
) -> CustomerPaymentResponse:
    amount_kurus, reference_type, reference_id = _resolve_customer_payment(
        session, entity_id, customer_id, payload
    )
    result = receivables_posting.post_customer_payment(
        session,
        entity_id,
        customer_id,
        payment_date=payload.payment_date,
        amount_kurus=amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
        payment_native_quantity=payload.payment_native_quantity,
        reference_type=reference_type,
        reference_id=reference_id,
    )
    return CustomerPaymentResponse(
        journal_entry_id=result.journal_entry.id,
        customer_ledger_entry=_customer_entry_read(
            session, result.customer_ledger_entry, entity_id=entity_id
        ),
        balance_kurus=result.balance_kurus,
    )


def _resolve_customer_payment(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    payload: CustomerPaymentCreate,
) -> tuple[int, str | None, uuid.UUID | None]:
    from app.features.banking.models import MoneyAccount, MoneyAccountKind
    from app.features.group_sales.fx_receivable import compute_try_payment_from_native

    reference_type = None
    reference_id = None
    if payload.group_sale_id is not None:
        reference_type = "group_sale"
        reference_id = payload.group_sale_id

    with entity_context(session, entity_id):
        money_account = session.scalar(
            select(MoneyAccount).where(
                MoneyAccount.gl_account_id == payload.payment_account_id,
            )
        )
        is_fx_wallet = (
            money_account is not None
            and money_account.account_kind == MoneyAccountKind.FOREIGN_CURRENCY
        )

        if payload.amount_kurus is not None:
            return payload.amount_kurus, reference_type, reference_id

        if not is_fx_wallet or payload.payment_native_quantity is None:
            raise ValueError("amount_kurus is required for TRY payments")

        currency = money_account.currency if money_account else None
        if not currency:
            raise ValueError("FX wallet currency missing")

        amount_kurus = compute_try_payment_from_native(
            session,
            customer_id,
            currency,
            payload.payment_native_quantity,
            group_sale_id=payload.group_sale_id,
        )
        return amount_kurus, reference_type, reference_id


def correct_customer_payment_entry(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: CustomerPaymentCreate,
    *,
    reason: str | None = None,
    void_date=None,
    period_unlock_reason: str | None = None,
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
        period_unlock_reason=period_unlock_reason,
    )
    balance = receivables_ledger.current_balance_kurus(session, entity_id, customer_id)
    with entity_context(session, entity_id):
        new_row = session.scalar(
            select(CustomerLedgerEntry).where(
                CustomerLedgerEntry.journal_entry_id == result.corrected.id
            )
        )
    return result, balance, new_row


def correct_credit_sale_entry(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: CreditSaleCreate,
    *,
    reason: str | None = None,
    void_date=None,
    period_unlock_reason: str | None = None,
):
    from app.core.receivables.models import CustomerLedgerEntry
    from app.core.receivables.types import CustomerMovementType

    with entity_context(session, entity_id):
        row = session.scalar(
            select(CustomerLedgerEntry).where(
                CustomerLedgerEntry.journal_entry_id == journal_entry_id
            )
        )
        if row is None or row.customer_id != customer_id:
            raise CorrectionNotFoundError("credit sale not found")
        if row.movement_type != CustomerMovementType.CREDIT_SALE:
            raise CorrectionNotFoundError("journal entry is not a credit sale")

    revenue_account_id = payload.revenue_account_id
    if revenue_account_id is None:
        from app.core.chart_of_accounts.default_chart import SALES_REVENUE_CODE
        from app.core.chart_of_accounts.models import Account

        with entity_context(session, entity_id):
            revenue = session.scalar(select(Account).where(Account.code == SALES_REVENUE_CODE))
            if revenue is None:
                raise LookupError("default revenue account not found")
            revenue_account_id = revenue.id

    result = correct_credit_sale(
        session,
        entity_id,
        journal_entry_id,
        sale_date=payload.sale_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        revenue_account_id=revenue_account_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
    )
    balance = receivables_ledger.current_balance_kurus(session, entity_id, customer_id)
    with entity_context(session, entity_id):
        new_row = session.scalar(
            select(CustomerLedgerEntry).where(
                CustomerLedgerEntry.journal_entry_id == result.corrected.id
            )
        )
    return result, balance, new_row


def void_customer_payment_entry(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date=None,
    period_unlock_reason: str | None = None,
):
    from app.features.ledger.schema import SubledgerVoidOut

    with entity_context(session, entity_id):
        row = session.scalar(
            select(CustomerLedgerEntry).where(
                CustomerLedgerEntry.journal_entry_id == journal_entry_id
            )
        )
        if row is None or row.customer_id != customer_id:
            raise CorrectionNotFoundError("customer payment not found")

    result = void_customer_payment(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
    )
    return SubledgerVoidOut(
        original_journal_entry_id=result.original.id,
        reversal_journal_entry_id=result.reversal.id,
    )


def void_credit_sale_entry(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date=None,
    period_unlock_reason: str | None = None,
):
    from app.core.receivables.types import CustomerMovementType
    from app.features.ledger.schema import SubledgerVoidOut

    with entity_context(session, entity_id):
        row = session.scalar(
            select(CustomerLedgerEntry).where(
                CustomerLedgerEntry.journal_entry_id == journal_entry_id
            )
        )
        if row is None or row.customer_id != customer_id:
            raise CorrectionNotFoundError("credit sale not found")
        if row.movement_type != CustomerMovementType.CREDIT_SALE:
            raise CorrectionNotFoundError("journal entry is not a credit sale")

    result = void_credit_sale(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
    )
    return SubledgerVoidOut(
        original_journal_entry_id=result.original.id,
        reversal_journal_entry_id=result.reversal.id,
    )
