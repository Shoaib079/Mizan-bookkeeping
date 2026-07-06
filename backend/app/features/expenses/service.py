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

from app.adapters.ocr_ai.expense_receipt import (
    ExpenseReceiptExtractionError,
    ExpenseReceiptUnsupportedError,
)
from app.core.chart_of_accounts.default_chart import GENERAL_EXPENSE_CODE
from app.core.chart_of_accounts.seed import get_account_by_code
from app.core.expenses.account_learning import (
    record_expense_account_learning,
    suggest_learned_expense_account,
    list_expense_accounts_for_entity,
)
from app.adapters.ocr_ai.expense_account_suggest import (
    ExpenseAccountSuggestError,
    suggest_expense_account_via_ai,
)
from app.core.expenses.items import InvalidExpenseItemError, merge_expense_items, resolve_expense_item
from app.core.ledger.correction import CorrectionNotFoundError, correct_expense_entry
from app.core.expenses.posting import (
    InvalidExpensePostingError,
    post_expense_entry,
)
from app.core.expenses.normalize import normalize_expense_item_text
from app.core.money import format_try
from app.db.session import entity_context, require_entity_context
from app.core.duplicate_guard import (
    ensure_not_duplicate,
    find_duplicate_expense,
)
from app.features.entities import service as entity_service
from app.features.expenses import receipt_service
from app.features.expenses.models import (
    ExpenseEntry,
    ExpenseEntryStatus,
    ExpenseItem,
    ExpenseItemAlias,
    ExpenseReceiptIntakeStatus,
)
from app.features.expenses.schema import (
    ConfirmExpenseReceiptLineRequest,
    ConfirmExpenseReceiptRequest,
    ConfirmTipPhotoRequest,
    ExpenseAccountSuggestResponse,
    ExpenseConfirmItemRequest,
    ExpenseCorrect,
    ExpenseCorrectOut,
    ExpenseCreate,
    ExpenseItemCreate,
    ExpenseItemMergeRequest,
    ExpenseItemRead,
    ExpenseRead,
    ExpenseReceiptRead,
)


class ExpenseNotReviewableError(ValueError):
    """Expense is not in needs_review status."""


class ExpenseNotCorrectableError(ValueError):
    """Expense is not in posted status or has no journal entry."""


class NotATipPhotoError(ValueError):
    """Expense did not come from a photo-tip upload — wrong confirm route."""


class DuplicateExpenseDocumentError(Exception):
    def __init__(self, existing: ExpenseRead) -> None:
        self.existing = existing
        super().__init__("Duplicate expense document for this entity")


# Backward-compat alias for Slice C tests importing ExpensePhotoUnsupportedError.
ExpensePhotoUnsupportedError = ExpenseReceiptUnsupportedError
ExpensePhotoExtractionError = ExpenseReceiptExtractionError


def _pick_tip_line(intake: ExpenseReceiptRead):
    if len(intake.lines) == 1:
        return intake.lines[0]
    for line in intake.lines:
        desc = (line.written_item_description or "").lower()
        if any(k in desc for k in ("bahşiş", "bahsis", "tip", "servis")):
            return line
    return None


def _intake_to_tip_expense_read(
    session: Session,
    entity_id: uuid.UUID,
    intake: ExpenseReceiptRead,
    default_expense_account_id: uuid.UUID,
) -> ExpenseRead:
    """Map unified receipt intake → Slice C ExpenseRead (tip line) for legacy tip-photos API."""
    tip_line = _pick_tip_line(intake)
    amount_kurus = tip_line.amount_kurus if tip_line is not None else 0
    expense_account_id = (
        tip_line.expense_account_id if tip_line is not None else default_expense_account_id
    )
    written_item_description = (
        tip_line.written_item_description if tip_line is not None else "Bahşiş"
    )
    candidate_expense_item_id = (
        tip_line.candidate_expense_item_id if tip_line is not None else None
    )
    line_review = tip_line.review_reason if tip_line is not None else intake.review_reason

    if intake.status == ExpenseReceiptIntakeStatus.POSTED:
        status = ExpenseEntryStatus.POSTED
        journal_entry_id: uuid.UUID | None = None
        expense_item_id: uuid.UUID | None = None
        if tip_line is not None and tip_line.expense_entry_id is not None:
            with entity_context(session, entity_id):
                entry = session.get(ExpenseEntry, tip_line.expense_entry_id)
                if entry is not None:
                    journal_entry_id = entry.journal_entry_id
                    expense_item_id = entry.expense_item_id
    else:
        status = ExpenseEntryStatus.NEEDS_REVIEW
        journal_entry_id = None
        expense_item_id = None

    review_reason = intake.review_reason or line_review
    if amount_kurus <= 0 and status == ExpenseEntryStatus.NEEDS_REVIEW:
        review_reason = (
            "No tip detected on the expense photo — enter the tip amount before posting"
        )
    elif amount_kurus > 0 and status == ExpenseEntryStatus.NEEDS_REVIEW:
        review_reason = review_reason or (
            f"Tip read from expense photo: {format_try(amount_kurus)} "
            "— confirm or correct before posting"
        )

    return ExpenseRead(
        id=intake.id,
        entity_id=intake.entity_id,
        expense_date=intake.expense_date,
        amount_kurus=amount_kurus,
        expense_account_id=expense_account_id,
        money_account_id=intake.money_account_id,
        written_item_description=written_item_description,
        expense_item_id=expense_item_id,
        status=status,
        has_source_document=True,
        description="Cash tip (from expense photo)",
        notes=None,
        actor_id=intake.actor_id,
        journal_entry_id=journal_entry_id,
        bank_statement_line_id=None,
        review_reason=review_reason,
        candidate_expense_item_id=candidate_expense_item_id,
        source_document_fingerprint=intake.file_fingerprint,
        source_document_path=intake.source_document_path,
        created_at=intake.created_at,
    )


def _to_item_read(item: ExpenseItem) -> ExpenseItemRead:
    return ExpenseItemRead(
        id=item.id,
        entity_id=item.entity_id,
        canonical_name=item.canonical_name,
        default_expense_account_id=item.default_expense_account_id,
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
        if q and q.strip():
            normalized = normalize_expense_item_text(q)
            search_clauses = []
            canonical_search = normalized_text_search_filter(
                q, ExpenseItem.canonical_name_normalized
            )
            if canonical_search is not None:
                search_clauses.append(canonical_search)
            text_search = text_search_filter(q, ExpenseItem.canonical_name)
            if text_search is not None:
                search_clauses.append(text_search)
            if normalized:
                alias_match = select(ExpenseItemAlias.expense_item_id).where(
                    ExpenseItemAlias.alias_normalized.contains(normalized)
                )
                search_clauses.append(ExpenseItem.id.in_(alias_match))
            if search_clauses:
                filters.append(or_(*search_clauses))
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
        learned_suggestion = (
            suggest_learned_expense_account(
                session, entity_id, payload.written_item_description or ""
            )
            if payload.written_item_description
            else None
        )
        suggested_account_id = (
            learned_suggestion.account_id if learned_suggestion is not None else None
        )

        ensure_not_duplicate(
            find_duplicate_expense(
                session,
                expense_date=payload.expense_date,
                amount_kurus=payload.amount_kurus,
                expense_account_id=payload.expense_account_id,
            ),
            acknowledged=payload.acknowledge_duplicate,
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
    entry_id = result.expense_entry.id
    with entity_context(session, entity_id):
        record_expense_account_learning(
            session,
            entity_id,
            written_item_description=payload.written_item_description,
            expense_account_id=payload.expense_account_id,
            expense_item_id=resolution.expense_item_id,
            suggested_account_id=suggested_account_id,
        )
        session.commit()
        entry = session.get(ExpenseEntry, entry_id)
    if entry is None:
        raise LookupError("Expense not found after posting")
    return _to_expense_read(entry)


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


def correct_expense_by_id(
    session: Session,
    entity_id: uuid.UUID,
    expense_id: uuid.UUID,
    payload: ExpenseCorrect,
) -> ExpenseCorrectOut:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        entry = session.get(ExpenseEntry, expense_id)
        if entry is None:
            raise LookupError("Expense not found")
        if entry.status != ExpenseEntryStatus.POSTED:
            raise ExpenseNotCorrectableError(
                f"expense status {entry.status.value!r} cannot be corrected"
            )
        if entry.journal_entry_id is None:
            raise ExpenseNotCorrectableError("expense has no journal entry to correct")

        resolution = resolve_expense_item(
            session,
            entity_id,
            payload.written_item_description,
            confirm_expense_item_id=payload.confirm_expense_item_id,
        )
        if resolution.status == ExpenseEntryStatus.NEEDS_REVIEW:
            raise InvalidExpenseItemError(
                resolution.review_reason or "expense item needs review before correction"
            )
        expense_item_id = resolution.expense_item_id
        original_journal_entry_id = entry.journal_entry_id

    result = correct_expense_entry(
        session,
        entity_id,
        original_journal_entry_id,
        expense_date=payload.expense_date,
        amount_kurus=payload.amount_kurus,
        expense_account_id=payload.expense_account_id,
        money_account_id=payload.money_account_id,
        description=payload.description,
        actor_id=payload.actor_id,
        written_item_description=payload.written_item_description,
        expense_item_id=expense_item_id,
        reason=payload.reason,
        void_date=payload.void_date,
        period_unlock_reason=payload.period_unlock_reason,
    )

    with entity_context(session, entity_id):
        session.refresh(entry)
        if entry.journal_entry_id != result.corrected.id:
            raise CorrectionNotFoundError("corrected expense entry not found")

    return ExpenseCorrectOut(
        original_journal_entry_id=result.original.id,
        reversal_journal_entry_id=result.reversal.id,
        corrected_journal_entry_id=result.corrected.id,
        expense=_to_expense_read(entry),
    )


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
    entry_id = result.expense_entry.id
    with entity_context(session, entity_id):
        record_expense_account_learning(
            session,
            entity_id,
            written_item_description=entry.written_item_description,
            expense_account_id=entry.expense_account_id,
            expense_item_id=expense_item_id,
        )
        session.commit()
        posted = session.get(ExpenseEntry, entry_id)
    if posted is None:
        raise LookupError("Expense not found after posting")
    return _to_expense_read(posted)


def suggest_expense_account(
    session: Session,
    entity_id: uuid.UUID,
    description: str,
) -> ExpenseAccountSuggestResponse:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        learned = suggest_learned_expense_account(session, entity_id, description)
        if learned is not None:
            return ExpenseAccountSuggestResponse(
                account_id=learned.account_id,
                source=learned.source,
                confidence=learned.confidence,
            )

        accounts = list_expense_accounts_for_entity(session, entity_id)
        try:
            ai = suggest_expense_account_via_ai(description, accounts)
        except ExpenseAccountSuggestError:
            ai = None
        if ai is not None:
            return ExpenseAccountSuggestResponse(
                account_id=ai.account_id,
                source=ai.source,
                confidence=ai.confidence,
            )
        return ExpenseAccountSuggestResponse()


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
    """Thin wrapper — unified expense-receipt intake, mapped to Slice C ExpenseRead."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    general_account = get_account_by_code(session, entity_id, GENERAL_EXPENSE_CODE)
    if general_account is None:
        raise ValueError(
            f"General expense account ({GENERAL_EXPENSE_CODE}) not found — seed the chart of accounts"
        )
    general_account_id = general_account.id

    try:
        intake = receipt_service.create_expense_receipt_from_upload(
            session,
            entity_id,
            content,
            money_account_id=money_account_id,
            actor_id=actor_id,
            filename=filename,
            content_type=content_type,
            tip_only=True,
        )
    except receipt_service.DuplicateExpenseReceiptError as exc:
        raise DuplicateExpenseDocumentError(
            _intake_to_tip_expense_read(session, entity_id, exc.existing, general_account_id)
        ) from exc

    return _intake_to_tip_expense_read(session, entity_id, intake, general_account_id)


def confirm_tip_expense(
    session: Session,
    entity_id: uuid.UUID,
    expense_id: uuid.UUID,
    payload: ConfirmTipPhotoRequest,
) -> ExpenseRead:
    """Confirm a photo-tip draft via unified receipt intake (expense_id = intake_id)."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    general_account = get_account_by_code(session, entity_id, GENERAL_EXPENSE_CODE)
    if general_account is None:
        raise ValueError("General expense account not found")
    general_account_id = general_account.id

    try:
        intake = receipt_service.get_expense_receipt(session, entity_id, expense_id)
    except LookupError:
        with entity_context(session, entity_id):
            entry = session.get(ExpenseEntry, expense_id)
            if entry is not None:
                raise NotATipPhotoError("expense did not come from a photo-tip upload") from None
        raise LookupError("Expense not found")

    if _pick_tip_line(intake) is None:
        raise NotATipPhotoError("expense did not come from a photo-tip upload")

    if intake.status not in {
        ExpenseReceiptIntakeStatus.DRAFT,
        ExpenseReceiptIntakeStatus.NEEDS_REVIEW,
    }:
        raise ExpenseNotReviewableError("expense is not awaiting review")

    tip_line = _pick_tip_line(intake)
    assert tip_line is not None
    amount_kurus = (
        payload.amount_kurus if payload.amount_kurus is not None else tip_line.amount_kurus
    )
    if amount_kurus <= 0:
        raise ExpenseNotReviewableError(
            "No tip amount — enter a positive amount to post this tip"
        )

    line_overrides: list[ConfirmExpenseReceiptLineRequest] = [
        ConfirmExpenseReceiptLineRequest(
            line_id=tip_line.id,
            amount_kurus=amount_kurus,
        )
    ]

    confirmed = receipt_service.confirm_expense_receipt(
        session,
        entity_id,
        expense_id,
        ConfirmExpenseReceiptRequest(
            actor_id=payload.actor_id,
            expense_date=payload.expense_date,
            money_account_id=payload.money_account_id,
            lines=line_overrides,
        ),
    )
    return _intake_to_tip_expense_read(session, entity_id, confirmed, general_account_id)
