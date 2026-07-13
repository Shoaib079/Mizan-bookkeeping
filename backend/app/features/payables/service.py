"""Payables read orchestration — writes delegate to core/payables (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.payables import ledger as payables_ledger
from app.core.payables import posting as payables_posting
from app.core.ledger.correction import (
    CorrectionNotFoundError,
    correct_supplier_invoice,
    correct_supplier_payment,
    void_supplier_invoice,
    void_supplier_payment,
)
from app.core.ledger.subledger_display import enrich_entry_models
from app.core.ledger.posting import (
    AlreadyVoidedError,
    InvalidAccountError,
    NotVoidableError,
    PostingError,
)
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.core.listing import ListParams, fetch_paginated_rows, text_search_filter
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.payables import invoice_edit
from app.features.payables.schema import SupplierLedgerEntryRead
from app.features.suppliers.models import Supplier


def supplier_entry_reads(
    session: Session, entries: list[SupplierLedgerEntry]
) -> list[SupplierLedgerEntryRead]:
    if not entries:
        return []
    reads = enrich_entry_models(
        session,
        SupplierLedgerEntryRead,
        entries,
        journal_entry_id=lambda entry: entry.journal_entry_id,
        description=lambda entry: entry.description,
    )
    # Restore the money account each payment was paid from, so the edit form
    # reopens with the recorded account instead of the first in the list.
    from app.core.payables.types import SupplierMovementType
    from app.features.banking.journal_money_account import (
        money_account_gl_by_journal_entry,
    )

    payment_je_ids = [
        r.journal_entry_id
        for r in reads
        if r.movement_type == SupplierMovementType.PAYMENT
        and r.journal_entry_id is not None
    ]
    if payment_je_ids:
        account_by_je = money_account_gl_by_journal_entry(session, payment_je_ids)
        for r in reads:
            if r.journal_entry_id in account_by_je:
                r.payment_account_id = account_by_je[r.journal_entry_id]
    return reads


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
        filters: list = []
        search = text_search_filter(q, Supplier.name, Supplier.vkn)
        if search is not None:
            filters.append(search)
        balance_expr = func.coalesce(func.sum(SupplierLedgerEntry.amount_kurus), 0)
        stmt = (
            select(
                Supplier,
                balance_expr.label("balance"),
            )
            .outerjoin(
                SupplierLedgerEntry,
                SupplierLedgerEntry.supplier_id == Supplier.id,
            )
            .where(*filters)
            .group_by(Supplier.id)
            .order_by(balance_expr.desc(), Supplier.name)
        )
        total_payables = int(
            session.scalar(
                select(func.coalesce(func.sum(SupplierLedgerEntry.amount_kurus), 0))
            )
            or 0
        )
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
    if movement_type in {
        SupplierMovementType.ADJUSTMENT,
        SupplierMovementType.OPENING_BALANCE,
    }:
        return payables_posting.post_supplier_manual_movement(
            session,
            entity_id,
            supplier_id,
            movement_date=movement_date,
            movement_type=movement_type,
            amount_kurus=amount_kurus,
            description=description,
            actor_id=actor_id,
        ).supplier_ledger_entry
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
    confirm_advance: bool = False,
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
        confirm_advance=confirm_advance,
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
    confirm_advance: bool = False,
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
        confirm_advance=confirm_advance,
    )
    balance = payables_ledger.current_balance_kurus(session, entity_id, supplier_id)
    with entity_context(session, entity_id):
        new_row = session.scalar(
            select(SupplierLedgerEntry).where(
                SupplierLedgerEntry.journal_entry_id == result.corrected.id
            )
        )
    return result, balance, new_row


def correct_supplier_invoice_entry(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    invoice_date,
    description: str,
    actor_id: uuid.UUID,
    expense_account_id: uuid.UUID,
    net_kurus: int,
    gross_kurus: int,
    vat_breakdown: list,
    reason: str | None = None,
    void_date=None,
    period_unlock_reason: str | None = None,
):
    with entity_context(session, entity_id):
        target_id = invoice_edit.resolve_supplier_invoice_edit_target(
            session, journal_entry_id
        )
        row = session.scalar(
            select(SupplierLedgerEntry).where(
                SupplierLedgerEntry.journal_entry_id == target_id
            )
        )
        if row is None or row.supplier_id != supplier_id:
            raise CorrectionNotFoundError("supplier invoice not found")
        if row.movement_type != SupplierMovementType.INVOICE:
            raise CorrectionNotFoundError("journal entry is not a supplier invoice")

    result = correct_supplier_invoice(
        session,
        entity_id,
        target_id,
        invoice_date=invoice_date,
        description=description,
        actor_id=actor_id,
        expense_account_id=expense_account_id,
        net_kurus=net_kurus,
        gross_kurus=gross_kurus,
        vat_breakdown=vat_breakdown,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
    )
    balance = payables_ledger.current_balance_kurus(session, entity_id, supplier_id)
    with entity_context(session, entity_id):
        new_row = session.scalar(
            select(SupplierLedgerEntry).where(
                SupplierLedgerEntry.journal_entry_id == result.corrected.id
            )
        )
    return result, balance, new_row


def void_supplier_payment_entry(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
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
            select(SupplierLedgerEntry).where(
                SupplierLedgerEntry.journal_entry_id == journal_entry_id
            )
        )
        if row is None or row.supplier_id != supplier_id:
            raise CorrectionNotFoundError("supplier payment not found")

    result = void_supplier_payment(
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


def void_supplier_invoice_entry(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date=None,
    period_unlock_reason: str | None = None,
):
    from app.features.ledger.schema import SubledgerVoidOut

    with entity_context(session, entity_id):
        target_id = invoice_edit.resolve_supplier_invoice_edit_target(
            session, journal_entry_id
        )
        row = session.scalar(
            select(SupplierLedgerEntry).where(
                SupplierLedgerEntry.journal_entry_id == target_id
            )
        )
        if row is None or row.supplier_id != supplier_id:
            raise CorrectionNotFoundError("supplier invoice not found")
        if row.movement_type != SupplierMovementType.INVOICE:
            raise CorrectionNotFoundError("journal entry is not a supplier invoice")

    result = void_supplier_invoice(
        session,
        entity_id,
        target_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
    )
    return SubledgerVoidOut(
        original_journal_entry_id=result.original.id,
        reversal_journal_entry_id=result.reversal.id,
    )
