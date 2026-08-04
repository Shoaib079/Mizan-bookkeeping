"""Split hub service — bank expenses + supplier payments → partner drawing."""

from __future__ import annotations

import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntry, JournalEntrySource, JournalEntryStatus
from app.core.listing import ListParams, fetch_paginated, fetch_paginated_rows, text_search_filter
from app.core.partners import posting as partner_posting
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.expenses.models import ExpenseEntry, ExpenseEntryStatus
from app.features.partners import service as partners_service
from app.features.splits.schema import (
    BankExpenseSplitCandidate,
    BankExpenseSplitCreate,
    BankExpenseSplitListOut,
    BankExpenseSplitResponse,
    SupplierPaymentSplitCandidate,
    SupplierPaymentSplitCreate,
    SupplierPaymentSplitListOut,
    SupplierPaymentSplitResponse,
)
from app.features.suppliers.models import Supplier


def list_bank_expense_split_candidates(
    session: Session,
    entity_id: uuid.UUID,
    params: ListParams,
    *,
    q: str | None = None,
) -> BankExpenseSplitListOut:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        filters = [
            ExpenseEntry.status == ExpenseEntryStatus.POSTED,
            ExpenseEntry.bank_statement_line_id.is_not(None),
            ExpenseEntry.journal_entry_id.is_not(None),
        ]
        text = text_search_filter(q, ExpenseEntry.description)
        if text is not None:
            filters.append(text)
        stmt = (
            select(ExpenseEntry)
            .where(*filters)
            .order_by(
                ExpenseEntry.expense_date.desc(),
                ExpenseEntry.created_at.desc(),
            )
        )
        rows, total = fetch_paginated(session, stmt, params)
        items: list[BankExpenseSplitCandidate] = []
        for expense in rows:
            assert expense.bank_statement_line_id is not None
            already = partner_posting.personal_already_split_from_expense_kurus(
                session, expense.id
            )
            remaining = expense.amount_kurus - already
            if remaining <= 0:
                continue
            items.append(
                BankExpenseSplitCandidate(
                    expense_id=expense.id,
                    expense_date=expense.expense_date,
                    description=expense.description,
                    amount_kurus=expense.amount_kurus,
                    expense_account_id=expense.expense_account_id,
                    already_split_kurus=already,
                    remaining_splittable_kurus=remaining,
                    bank_statement_line_id=expense.bank_statement_line_id,
                )
            )
        return BankExpenseSplitListOut(
            items=items,
            total=total,
            limit=params.limit,
            offset=params.offset,
        )


def record_bank_expense_split(
    session: Session,
    entity_id: uuid.UUID,
    payload: BankExpenseSplitCreate,
) -> BankExpenseSplitResponse:
    result = partner_posting.post_expense_personal_split(
        session,
        entity_id,
        payload.partner_id,
        expense_id=payload.expense_id,
        personal_amount_kurus=payload.personal_amount_kurus,
        note=payload.note,
        actor_id=payload.actor_id,
    )
    return BankExpenseSplitResponse(
        journal_entry_id=result.journal_entry.id,
        partner_ledger_entry=partners_service._partner_entry_read(
            session, result.partner_ledger_entry, entity_id=entity_id
        ),
        personal_amount_kurus=result.personal_amount_kurus,
        restaurant_amount_kurus=result.restaurant_amount_kurus,
        remaining_splittable_kurus=result.remaining_splittable_kurus,
        description=result.description,
    )


def list_supplier_payment_split_candidates(
    session: Session,
    entity_id: uuid.UUID,
    params: ListParams,
    *,
    q: str | None = None,
) -> SupplierPaymentSplitListOut:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        filters = [
            SupplierLedgerEntry.movement_type == SupplierMovementType.PAYMENT,
            SupplierLedgerEntry.journal_entry_id.is_not(None),
            JournalEntry.status == JournalEntryStatus.POSTED,
            JournalEntry.source == JournalEntrySource.PAYMENT,
        ]
        text_payment = text_search_filter(q, SupplierLedgerEntry.description)
        text_supplier = text_search_filter(q, Supplier.name)
        stmt = (
            select(SupplierLedgerEntry, Supplier.name)
            .join(Supplier, Supplier.id == SupplierLedgerEntry.supplier_id)
            .join(
                JournalEntry,
                JournalEntry.id == SupplierLedgerEntry.journal_entry_id,
            )
            .where(*filters)
        )
        if text_payment is not None and text_supplier is not None:
            stmt = stmt.where(or_(text_payment, text_supplier))
        elif text_payment is not None:
            stmt = stmt.where(text_payment)
        elif text_supplier is not None:
            stmt = stmt.where(text_supplier)
        stmt = stmt.order_by(
            SupplierLedgerEntry.movement_date.desc(),
            SupplierLedgerEntry.created_at.desc(),
        )
        rows, total = fetch_paginated_rows(session, stmt, params)
        items: list[SupplierPaymentSplitCandidate] = []
        for payment_row, supplier_name in rows:
            assert payment_row.journal_entry_id is not None
            payment_amount = abs(payment_row.amount_kurus)
            already = (
                partner_posting.personal_already_split_from_supplier_payment_kurus(
                    session, payment_row.id
                )
            )
            remaining = payment_amount - already
            if remaining <= 0:
                continue
            items.append(
                SupplierPaymentSplitCandidate(
                    supplier_ledger_entry_id=payment_row.id,
                    supplier_id=payment_row.supplier_id,
                    supplier_name=supplier_name,
                    payment_date=payment_row.movement_date,
                    description=payment_row.description,
                    amount_kurus=payment_amount,
                    already_split_kurus=already,
                    remaining_splittable_kurus=remaining,
                    journal_entry_id=payment_row.journal_entry_id,
                )
            )
        return SupplierPaymentSplitListOut(
            items=items,
            total=total,
            limit=params.limit,
            offset=params.offset,
        )


def record_supplier_payment_split(
    session: Session,
    entity_id: uuid.UUID,
    payload: SupplierPaymentSplitCreate,
) -> SupplierPaymentSplitResponse:
    result = partner_posting.post_supplier_payment_personal_split(
        session,
        entity_id,
        payload.partner_id,
        supplier_ledger_entry_id=payload.supplier_ledger_entry_id,
        personal_amount_kurus=payload.personal_amount_kurus,
        expense_account_id=payload.expense_account_id,
        note=payload.note,
        actor_id=payload.actor_id,
    )
    return SupplierPaymentSplitResponse(
        journal_entry_id=result.journal_entry.id,
        partner_ledger_entry=partners_service._partner_entry_read(
            session, result.partner_ledger_entry, entity_id=entity_id
        ),
        personal_amount_kurus=result.personal_amount_kurus,
        restaurant_amount_kurus=result.restaurant_amount_kurus,
        remaining_splittable_kurus=result.remaining_splittable_kurus,
        description=result.description,
    )
