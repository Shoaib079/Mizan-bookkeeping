"""Daily expenses service — create, list, confirm, merge (Decisions §7, §22)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.listing import (
    ListParams,
    amount_range_filters,
    date_range_filters,
    fetch_paginated,
    normalized_text_search_filter,
    text_search_filter,
)

from app.core.expenses.items import InvalidExpenseItemError, merge_expense_items, resolve_expense_item
from app.core.expenses.posting import InvalidExpensePostingError, post_expense_entry
from app.core.expenses.normalize import normalize_expense_item_text
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.expenses.models import ExpenseEntry, ExpenseEntryStatus, ExpenseItem
from app.features.expenses.schema import (
    ExpenseConfirmItemRequest,
    ExpenseCreate,
    ExpenseItemCreate,
    ExpenseItemMergeRequest,
    ExpenseItemRead,
    ExpenseRead,
)


class ExpenseNotReviewableError(ValueError):
    """Expense is not in needs_review status."""


def _to_item_read(item: ExpenseItem) -> ExpenseItemRead:
    return ExpenseItemRead(
        id=item.id,
        entity_id=item.entity_id,
        canonical_name=item.canonical_name,
        is_active=item.is_active,
        created_at=item.created_at,
    )


def _to_expense_read(entry: ExpenseEntry) -> ExpenseRead:
    return ExpenseRead(
        id=entry.id,
        entity_id=entry.entity_id,
        expense_date=entry.expense_date,
        amount_kurus=entry.amount_kurus,
        expense_account_id=entry.expense_account_id,
        money_account_id=entry.money_account_id,
        written_item_description=entry.written_item_description,
        expense_item_id=entry.expense_item_id,
        status=entry.status,
        has_source_document=entry.has_source_document,
        description=entry.description,
        notes=entry.notes,
        actor_id=entry.actor_id,
        journal_entry_id=entry.journal_entry_id,
        bank_statement_line_id=entry.bank_statement_line_id,
        review_reason=entry.review_reason,
        candidate_expense_item_id=entry.candidate_expense_item_id,
        created_at=entry.created_at,
    )


def create_expense_item(
    session: Session,
    entity_id: uuid.UUID,
    payload: ExpenseItemCreate,
) -> ExpenseItemRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    trimmed = payload.canonical_name.strip()
    if not trimmed:
        raise ValueError("canonical_name cannot be empty")

    with entity_context(session, entity_id):
        require_entity_context()
        normalized = normalize_expense_item_text(trimmed)
        existing = session.scalar(
            select(ExpenseItem).where(
                ExpenseItem.canonical_name_normalized == normalized,
                ExpenseItem.is_active.is_(True),
            )
        )
        if existing is not None:
            raise InvalidExpenseItemError(
                f"expense item '{existing.canonical_name}' already exists"
            )

        item = ExpenseItem(
            canonical_name=trimmed,
            canonical_name_normalized=normalized,
            is_active=True,
        )
        session.add(item)
        session.commit()
        session.refresh(item)
        return _to_item_read(item)


def list_expense_items(
    session: Session,
    entity_id: uuid.UUID,
    *,
    include_inactive: bool = False,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[ExpenseItemRead], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if not include_inactive:
            filters.append(ExpenseItem.is_active.is_(True))
        search = normalized_text_search_filter(q, ExpenseItem.canonical_name_normalized)
        if search is None and q:
            search = text_search_filter(q, ExpenseItem.canonical_name)
        if search is not None:
            filters.append(search)
        stmt = select(ExpenseItem).where(*filters).order_by(ExpenseItem.canonical_name)
        items, total = fetch_paginated(session, stmt, params)
        return [_to_item_read(item) for item in items], total


def merge_items(
    session: Session,
    entity_id: uuid.UUID,
    payload: ExpenseItemMergeRequest,
) -> ExpenseItemRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        target = merge_expense_items(
            session,
            entity_id,
            payload.source_id,
            payload.target_id,
        )
        session.commit()
        session.refresh(target)
        return _to_item_read(target)


def create_expense(
    session: Session,
    entity_id: uuid.UUID,
    payload: ExpenseCreate,
) -> ExpenseRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        resolution = resolve_expense_item(
            session,
            entity_id,
            payload.written_item_description,
            confirm_expense_item_id=payload.confirm_expense_item_id,
        )

        if resolution.status == ExpenseEntryStatus.NEEDS_REVIEW:
            entry = ExpenseEntry(
                expense_date=payload.expense_date,
                amount_kurus=payload.amount_kurus,
                expense_account_id=payload.expense_account_id,
                money_account_id=payload.money_account_id,
                written_item_description=payload.written_item_description,
                expense_item_id=None,
                status=ExpenseEntryStatus.NEEDS_REVIEW,
                has_source_document=payload.has_source_document,
                description=payload.description,
                notes=payload.notes,
                actor_id=payload.actor_id,
                review_reason=resolution.review_reason,
                candidate_expense_item_id=resolution.candidate_expense_item_id,
            )
            session.add(entry)
            session.commit()
            session.refresh(entry)
            return _to_expense_read(entry)

    result = post_expense_entry(
        session,
        entity_id,
        expense_date=payload.expense_date,
        amount_kurus=payload.amount_kurus,
        expense_account_id=payload.expense_account_id,
        money_account_id=payload.money_account_id,
        description=payload.description,
        actor_id=payload.actor_id,
        written_item_description=payload.written_item_description,
        expense_item_id=resolution.expense_item_id,
        has_source_document=payload.has_source_document,
        notes=payload.notes,
    )
    return _to_expense_read(result.expense_entry)


def list_expenses(
    session: Session,
    entity_id: uuid.UUID,
    *,
    status: ExpenseEntryStatus | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    q: str | None = None,
    min_amount: int | None = None,
    max_amount: int | None = None,
    expense_account_id: uuid.UUID | None = None,
    money_account_id: uuid.UUID | None = None,
    expense_item_id: uuid.UUID | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[ExpenseRead], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if status is not None:
            filters.append(ExpenseEntry.status == status)
        filters.extend(
            date_range_filters(
                ExpenseEntry.expense_date, from_date=from_date, to_date=to_date
            )
        )
        filters.extend(
            amount_range_filters(
                ExpenseEntry.amount_kurus,
                min_amount=min_amount,
                max_amount=max_amount,
            )
        )
        if expense_account_id is not None:
            filters.append(ExpenseEntry.expense_account_id == expense_account_id)
        if money_account_id is not None:
            filters.append(ExpenseEntry.money_account_id == money_account_id)
        if expense_item_id is not None:
            filters.append(ExpenseEntry.expense_item_id == expense_item_id)
        if q:
            item_search = normalized_text_search_filter(
                q, ExpenseItem.canonical_name_normalized
            )
            text_clauses = [
                c
                for c in (
                    text_search_filter(q, ExpenseEntry.description),
                    text_search_filter(q, ExpenseEntry.written_item_description),
                    item_search,
                )
                if c is not None
            ]
            if text_clauses:
                stmt = (
                    select(ExpenseEntry)
                    .outerjoin(
                        ExpenseItem,
                        ExpenseEntry.expense_item_id == ExpenseItem.id,
                    )
                    .where(*filters, or_(*text_clauses))
                )
            else:
                stmt = select(ExpenseEntry).where(*filters)
        else:
            stmt = select(ExpenseEntry).where(*filters)
        stmt = stmt.order_by(
            ExpenseEntry.expense_date.desc(),
            ExpenseEntry.created_at.desc(),
        )
        entries, total = fetch_paginated(session, stmt, params)
        return [_to_expense_read(entry) for entry in entries], total


def confirm_expense_item(
    session: Session,
    entity_id: uuid.UUID,
    expense_id: uuid.UUID,
    payload: ExpenseConfirmItemRequest,
) -> ExpenseRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        entry = session.get(ExpenseEntry, expense_id)
        if entry is None:
            raise LookupError("Expense not found")
        if entry.status != ExpenseEntryStatus.NEEDS_REVIEW:
            raise ExpenseNotReviewableError("expense is not awaiting item review")

        resolution = resolve_expense_item(
            session,
            entity_id,
            entry.written_item_description,
            confirm_expense_item_id=payload.expense_item_id,
        )
        if resolution.status != ExpenseEntryStatus.POSTED:
            raise InvalidExpenseItemError("item resolution did not produce a posted status")
        expense_item_id = resolution.expense_item_id

    result = post_expense_entry(
        session,
        entity_id,
        expense_date=entry.expense_date,
        amount_kurus=entry.amount_kurus,
        expense_account_id=entry.expense_account_id,
        money_account_id=entry.money_account_id,
        description=entry.description,
        actor_id=payload.actor_id,
        written_item_description=entry.written_item_description,
        expense_item_id=expense_item_id,
        has_source_document=entry.has_source_document,
        notes=entry.notes,
        existing_expense_entry=entry,
    )
    return _to_expense_read(result.expense_entry)
