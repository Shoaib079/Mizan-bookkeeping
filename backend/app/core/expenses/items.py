"""Expense item resolution and merge — spelling tolerance (Decisions §22)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.expenses.normalize import FUZZY_MATCH_THRESHOLD, normalize_expense_item_text, similarity_score
from app.db.session import require_entity_context
from app.features.expenses.models import ExpenseEntryStatus, ExpenseItem, ExpenseItemAlias


class InvalidExpenseItemError(ValueError):
    """Expense item resolution or merge failed."""


@dataclass(frozen=True, slots=True)
class ExpenseItemResolution:
    expense_item_id: uuid.UUID | None
    status: ExpenseEntryStatus
    candidate_expense_item_id: uuid.UUID | None = None
    review_reason: str | None = None


def _get_active_item(
    session: Session, entity_id: uuid.UUID, expense_item_id: uuid.UUID
) -> ExpenseItem:
    item = session.get(ExpenseItem, expense_item_id)
    if item is None or item.entity_id != entity_id or not item.is_active:
        raise InvalidExpenseItemError("expense item not found or inactive")
    return item


def _ensure_alias(
    session: Session,
    *,
    entity_id: uuid.UUID,
    alias_normalized: str,
    expense_item_id: uuid.UUID,
) -> None:
    existing = session.scalar(
        select(ExpenseItemAlias).where(
            ExpenseItemAlias.entity_id == entity_id,
            ExpenseItemAlias.alias_normalized == alias_normalized,
        )
    )
    if existing is not None:
        if existing.expense_item_id != expense_item_id:
            raise InvalidExpenseItemError("alias already mapped to a different expense item")
        return

    session.add(
        ExpenseItemAlias(
            entity_id=entity_id,
            alias_normalized=alias_normalized,
            expense_item_id=expense_item_id,
        )
    )
    session.flush()


def _create_item_with_alias(
    session: Session,
    *,
    entity_id: uuid.UUID,
    canonical_name: str,
) -> ExpenseItem:
    trimmed = canonical_name.strip()
    if not trimmed:
        raise InvalidExpenseItemError("written item description cannot be empty")

    normalized = normalize_expense_item_text(trimmed)
    item = ExpenseItem(
        entity_id=entity_id,
        canonical_name=trimmed,
        canonical_name_normalized=normalized,
        is_active=True,
    )
    session.add(item)
    session.flush()
    _ensure_alias(
        session,
        entity_id=entity_id,
        alias_normalized=normalized,
        expense_item_id=item.id,
    )
    return item


def _best_fuzzy_match(
    session: Session, entity_id: uuid.UUID, written_normalized: str
) -> tuple[ExpenseItem | None, float]:
    items = session.scalars(
        select(ExpenseItem).where(
            ExpenseItem.entity_id == entity_id,
            ExpenseItem.is_active.is_(True),
        )
    ).all()

    best_item: ExpenseItem | None = None
    best_score = 0.0
    for item in items:
        score = similarity_score(written_normalized, item.canonical_name_normalized)
        if score > best_score:
            best_score = score
            best_item = item

    return best_item, best_score


def resolve_expense_item(
    session: Session,
    entity_id: uuid.UUID,
    written_item_description: str | None,
    *,
    confirm_expense_item_id: uuid.UUID | None = None,
) -> ExpenseItemResolution:
    """Resolve handwritten item text to a canonical expense item (entity context required)."""
    require_entity_context()

    if not written_item_description or not written_item_description.strip():
        return ExpenseItemResolution(
            expense_item_id=None,
            status=ExpenseEntryStatus.POSTED,
        )

    trimmed = written_item_description.strip()
    normalized = normalize_expense_item_text(trimmed)

    alias = session.scalar(
        select(ExpenseItemAlias).where(
            ExpenseItemAlias.entity_id == entity_id,
            ExpenseItemAlias.alias_normalized == normalized,
        )
    )
    if alias is not None:
        item = _get_active_item(session, entity_id, alias.expense_item_id)
        return ExpenseItemResolution(
            expense_item_id=item.id,
            status=ExpenseEntryStatus.POSTED,
        )

    if confirm_expense_item_id is not None:
        item = _get_active_item(session, entity_id, confirm_expense_item_id)
        _ensure_alias(
            session,
            entity_id=entity_id,
            alias_normalized=normalized,
            expense_item_id=item.id,
        )
        return ExpenseItemResolution(
            expense_item_id=item.id,
            status=ExpenseEntryStatus.POSTED,
        )

    best_item, best_score = _best_fuzzy_match(session, entity_id, normalized)
    if best_item is not None and best_score >= FUZZY_MATCH_THRESHOLD:
        return ExpenseItemResolution(
            expense_item_id=None,
            status=ExpenseEntryStatus.NEEDS_REVIEW,
            candidate_expense_item_id=best_item.id,
            review_reason=(
                f"Possible match to '{best_item.canonical_name}' "
                f"(similarity {best_score:.2f})"
            ),
        )

    item = _create_item_with_alias(
        session,
        entity_id=entity_id,
        canonical_name=trimmed,
    )
    return ExpenseItemResolution(
        expense_item_id=item.id,
        status=ExpenseEntryStatus.POSTED,
    )


def merge_expense_items(
    session: Session,
    entity_id: uuid.UUID,
    source_id: uuid.UUID,
    target_id: uuid.UUID,
) -> ExpenseItem:
    """Merge source item into target — move aliases and entries, deactivate source."""
    if source_id == target_id:
        raise InvalidExpenseItemError("source and target must differ")

    require_entity_context()

    source = _get_active_item(session, entity_id, source_id)
    target = _get_active_item(session, entity_id, target_id)

    from app.features.expenses.models import ExpenseEntry

    session.execute(
        ExpenseEntry.__table__.update()
        .where(
            ExpenseEntry.entity_id == entity_id,
            ExpenseEntry.expense_item_id == source.id,
        )
        .values(expense_item_id=target.id)
    )
    session.execute(
        ExpenseEntry.__table__.update()
        .where(
            ExpenseEntry.entity_id == entity_id,
            ExpenseEntry.candidate_expense_item_id == source.id,
        )
        .values(candidate_expense_item_id=target.id)
    )

    source_aliases = session.scalars(
        select(ExpenseItemAlias).where(
            ExpenseItemAlias.entity_id == entity_id,
            ExpenseItemAlias.expense_item_id == source.id,
        )
    ).all()
    for alias in source_aliases:
        existing = session.scalar(
            select(ExpenseItemAlias).where(
                ExpenseItemAlias.entity_id == entity_id,
                ExpenseItemAlias.alias_normalized == alias.alias_normalized,
            )
        )
        if existing is None:
            alias.expense_item_id = target.id
        else:
            session.delete(alias)

    source.is_active = False
    session.flush()
    session.refresh(target)
    return target
