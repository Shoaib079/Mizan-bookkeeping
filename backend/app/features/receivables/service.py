"""Receivables summary service (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.receivables.models import CustomerLedgerEntry
from app.core.listing import ListParams, fetch_paginated_rows, text_search_filter
from app.db.session import entity_context, require_entity_context
from app.features.customers.models import Customer
from app.features.entities import service as entity_service
from app.features.group_sales.fx_receivable import (
    outstanding_by_currency_for_customers,
)


def list_receivables(
    session: Session,
    entity_id: uuid.UUID,
    *,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[int, list[tuple[Customer, int, list[tuple[str, int]]]], int]:
    """Total owed, one row per customer, and the page total.

    Each row carries the lira balance and, when the customer was billed in a
    foreign currency, what they still owe in that currency. The lira figure
    remains the ledger's truth; the native one is what the customer agreed to
    hand over, and the two drift apart with the rate until they do.
    """
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters: list = []
        search = text_search_filter(q, Customer.name, Customer.identifier)
        if search is not None:
            filters.append(search)
        balance_expr = func.coalesce(func.sum(CustomerLedgerEntry.amount_kurus), 0)
        stmt = (
            select(Customer, balance_expr.label("balance_kurus"))
            .outerjoin(
                CustomerLedgerEntry,
                CustomerLedgerEntry.customer_id == Customer.id,
            )
            .where(*filters)
            .group_by(Customer.id)
            .having(balance_expr != 0)
            .order_by(balance_expr.desc(), Customer.name)
        )
        total_receivables = int(
            session.scalar(
                select(func.coalesce(func.sum(CustomerLedgerEntry.amount_kurus), 0))
            )
            or 0
        )
        rows, total = fetch_paginated_rows(session, stmt, params)

        # One query for the whole page, not one per customer: this list runs
        # to 200 rows and the per-customer helper costs 1 + N each.
        forex = outstanding_by_currency_for_customers(
            session, [customer.id for customer, _ in rows]
        )

        balances: list[tuple[Customer, int, list[tuple[str, int]]]] = [
            (customer, int(balance or 0), forex.get(customer.id, []))
            for customer, balance in rows
        ]

        return total_receivables, balances, total
