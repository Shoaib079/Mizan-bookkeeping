"""Payables read orchestration — writes delegate to core/payables (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.payables import ledger as payables_ledger
from app.core.payables import posting as payables_posting
from app.core.ledger.correction import CorrectionNotFoundError, correct_supplier_payment
from app.core.ledger.posting import InvalidAccountError, PostingError
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.core.listing import ListParams, fetch_paginated_rows, text_search_filter
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.suppliers.models import Supplier


def list_payables(
    session: Session,
    entity_id: uuid.UUID,
    *,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[int, list[tuple[Supplier, int]], int]:
    """Return (total_payables_kurus, [(supplier, balance_kurus), ...], row_count)."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = [Supplier.is_active.is_(True)]
        search = text_search_filter(q, Supplier.name, Supplier.vkn)
        if search is not None:
            filters.append(search)
        stmt = (
            select(
                Supplier,
                func.coalesce(func.sum(SupplierLedgerEntry.amount_kurus), 0).label("balance"),
            )
            .outerjoin(
                SupplierLedgerEntry,
                SupplierLedgerEntry.supplier_id == Supplier.id,
            )
            .where(*filters)
            .group_by(Supplier.id)
            .order_by(Supplier.name)
        )
        all_rows = session.execute(stmt).all()
        total_payables = sum(int(balance) for _, balance in all_rows)
        rows, total = fetch_paginated_rows(session, stmt, params)
        result_rows: list[tuple[Supplier, int]] = [
            (supplier, int(balance)) for supplier, balance in rows
        ]
        return total_payables, result_rows, total


def get_supplier_ledger(
    session: Session, entity_id: uuid.UUID, supplier_id: uuid.UUID
) -> tuple[int, list]:
    balance = payables_ledger.current_balance_kurus(session, entity_id, supplier_id)
    entries = payables_ledger.list_ledger_entries(session, entity_id, supplier_id)
    return balance, entries


def record_movement(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    *,
    movement_date,
    movement_type: SupplierMovementType,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
):
    return payables_ledger.record_supplier_movement(
        session,
        entity_id,
        supplier_id,
        movement_date=movement_date,
        movement_type=movement_type,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
    )


def record_payment(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    *,
    payment_date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    reference: str | None = None,
):
    return payables_posting.post_supplier_payment(
        session,
        entity_id,
        supplier_id,
        payment_date=payment_date,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
        payment_account_id=payment_account_id,
        reference_type=reference,
    )


def correct_supplier_payment_entry(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    payment_date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    reference: str | None = None,
    reason: str | None = None,
    void_date=None,
    period_unlock_reason: str | None = None,
):
    with entity_context(session, entity_id):
        row = session.scalar(
            select(SupplierLedgerEntry).where(
                SupplierLedgerEntry.journal_entry_id == journal_entry_id
            )
        )
        if row is None or row.supplier_id != supplier_id:
            raise CorrectionNotFoundError("supplier payment not found")

    result = correct_supplier_payment(
        session,
        entity_id,
        journal_entry_id,
        payment_date=payment_date,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
        payment_account_id=payment_account_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        reference_type=reference,
    )
    balance = payables_ledger.current_balance_kurus(session, entity_id, supplier_id)
    with entity_context(session, entity_id):
        new_row = session.scalar(
            select(SupplierLedgerEntry).where(
                SupplierLedgerEntry.journal_entry_id == result.corrected.id
            )
        )
    return result, balance, new_row
