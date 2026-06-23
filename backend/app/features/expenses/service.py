"""Daily expenses service — create, list, confirm, merge (Decisions §7, §22)."""

from __future__ import annotations

import hashlib
import uuid
from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.listing import (
    ListParams,
    amount_range_filters,
    date_range_filters,
    fetch_paginated,
    normalized_text_search_filter,
    text_search_filter,
)

from app.adapters.ocr_ai.expense_photo import (
    ExpensePhotoExtractionError,
    ExpensePhotoUnsupportedError,
    extract_expense_photo,
    extraction_to_payload,
)
from app.adapters.storage.local import save_upload
from app.core.chart_of_accounts.default_chart import TIPS_EXPENSE_CODE
from app.core.chart_of_accounts.seed import get_account_by_code
from app.core.expenses.items import InvalidExpenseItemError, merge_expense_items, resolve_expense_item
from app.core.expenses.posting import (
    InvalidExpensePostingError,
    _validate_money_account,
    post_expense_entry,
)
from app.core.expenses.normalize import normalize_expense_item_text
from app.core.money import format_try
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.expenses.models import ExpenseEntry, ExpenseEntryStatus, ExpenseItem
from app.features.expenses.schema import (
    ConfirmTipPhotoRequest,
    ExpenseConfirmItemRequest,
    ExpenseCreate,
    ExpenseItemCreate,
    ExpenseItemMergeRequest,
    ExpenseItemRead,
    ExpenseRead,
)


class ExpenseNotReviewableError(ValueError):
    """Expense is not in needs_review status."""


class NotATipPhotoError(ValueError):
    """Expense did not come from a photo-tip upload — wrong confirm route."""


class DuplicateExpenseDocumentError(Exception):
    def __init__(self, existing: ExpenseRead) -> None:
        self.existing = existing
        super().__init__("Duplicate expense document for this entity")


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
        source_document_fingerprint=entry.source_document_fingerprint,
        source_document_path=entry.source_document_path,
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


def _extension_for(filename: str | None, content_type: str | None) -> str:
    if filename:
        lower = filename.lower()
        for ext in (".jpg", ".jpeg", ".png", ".webp", ".pdf", ".txt"):
            if lower.endswith(ext):
                return ext
    if content_type:
        lower = content_type.lower()
        if "jpeg" in lower or "jpg" in lower:
            return ".jpg"
        if "png" in lower:
            return ".png"
        if "webp" in lower:
            return ".webp"
        if "pdf" in lower:
            return ".pdf"
    return ".jpg"


def create_tip_expense_from_photo(
    session: Session,
    entity_id: uuid.UUID,
    content: bytes,
    *,
    money_account_id: uuid.UUID,
    actor_id: uuid.UUID,
    filename: str | None = None,
    content_type: str | None = None,
) -> ExpenseRead:
    """Read a cash tip off an uploaded expense photo → 5700 draft in Needs Review (Slice C).

    Review-first: nothing posts here. The owner confirms (and may correct) the tip,
    then ``confirm_tip_expense`` posts ``Dr 5700 Tips Expense / Cr cash``.
    """
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    fingerprint = hashlib.sha256(content).hexdigest()

    # NOTE: each entity_context clears the RLS GUC on exit, so these context-managed
    # lookups are kept flat (never nested) to avoid wiping the entity scope mid-call.
    with entity_context(session, entity_id):
        require_entity_context()
        existing = session.scalar(
            select(ExpenseEntry).where(
                ExpenseEntry.source_document_fingerprint == fingerprint
            )
        )
        if existing is not None:
            raise DuplicateExpenseDocumentError(_to_expense_read(existing))

    tips_account = get_account_by_code(session, entity_id, TIPS_EXPENSE_CODE)
    if tips_account is None:
        raise ValueError(
            f"Tips Expense account ({TIPS_EXPENSE_CODE}) not found — seed the chart of accounts"
        )
    tips_account_id = tips_account.id

    # Validate the cash/bank account now so a draft can never become unpostable.
    with entity_context(session, entity_id):
        require_entity_context()
        _validate_money_account(session, entity_id, money_account_id)

    extraction = extract_expense_photo(content)

    stored_path = save_upload(
        entity_id,
        fingerprint,
        content,
        extension=_extension_for(filename, content_type),
    )
    payload = extraction_to_payload(extraction)
    payload["stored_path"] = stored_path

    if extraction.tip_found and extraction.tip_kurus > 0:
        amount_kurus = extraction.tip_kurus
        review_reason = (
            f"Tip read from expense photo: {format_try(extraction.tip_kurus)} "
            "— confirm or correct before posting"
        )
    else:
        amount_kurus = 0
        review_reason = (
            "No tip detected on the expense photo — enter the tip amount before posting"
        )

    expense_date = extraction.expense_date or date.today()

    with entity_context(session, entity_id):
        require_entity_context()
        entry = ExpenseEntry(
            expense_date=expense_date,
            amount_kurus=amount_kurus,
            expense_account_id=tips_account_id,
            money_account_id=money_account_id,
            written_item_description="Bahşiş",
            expense_item_id=None,
            status=ExpenseEntryStatus.NEEDS_REVIEW,
            has_source_document=True,
            description="Cash tip (from expense photo)",
            notes=None,
            actor_id=actor_id,
            review_reason=review_reason,
            candidate_expense_item_id=None,
            source_document_fingerprint=fingerprint,
            source_document_path=stored_path,
        )
        session.add(entry)
        try:
            session.commit()
        except IntegrityError as exc:
            # Concurrent upload of the same photo lost the race to the per-entity
            # unique constraint — surface it as a clean duplicate, not a 500.
            session.rollback()
            if "uq_expense_entries_entity_source_fingerprint" in str(exc.orig):
                existing = session.scalar(
                    select(ExpenseEntry).where(
                        ExpenseEntry.source_document_fingerprint == fingerprint
                    )
                )
                if existing is not None:
                    raise DuplicateExpenseDocumentError(_to_expense_read(existing)) from exc
            raise
        session.refresh(entry)
        return _to_expense_read(entry)


def confirm_tip_expense(
    session: Session,
    entity_id: uuid.UUID,
    expense_id: uuid.UUID,
    payload: ConfirmTipPhotoRequest,
) -> ExpenseRead:
    """Post a reviewed photo-tip draft → Dr 5700 / Cr cash (Slice C)."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        entry = session.get(ExpenseEntry, expense_id)
        if entry is None:
            raise LookupError("Expense not found")
        if entry.source_document_fingerprint is None:
            raise NotATipPhotoError("expense did not come from a photo-tip upload")
        if entry.status != ExpenseEntryStatus.NEEDS_REVIEW:
            raise ExpenseNotReviewableError("expense is not awaiting review")

        amount_kurus = (
            payload.amount_kurus if payload.amount_kurus is not None else entry.amount_kurus
        )
        money_account_id = payload.money_account_id or entry.money_account_id
        expense_date = payload.expense_date or entry.expense_date
        description = payload.description or entry.description
        notes = payload.notes if payload.notes is not None else entry.notes
        expense_account_id = entry.expense_account_id
        written_item_description = entry.written_item_description

    if amount_kurus <= 0:
        raise ExpenseNotReviewableError(
            "No tip amount — enter a positive amount to post this tip"
        )

    result = post_expense_entry(
        session,
        entity_id,
        expense_date=expense_date,
        amount_kurus=amount_kurus,
        expense_account_id=expense_account_id,
        money_account_id=money_account_id,
        description=description,
        actor_id=payload.actor_id,
        written_item_description=written_item_description,
        expense_item_id=None,
        has_source_document=True,
        notes=notes,
        existing_expense_entry=entry,
    )
    return _to_expense_read(result.expense_entry)
