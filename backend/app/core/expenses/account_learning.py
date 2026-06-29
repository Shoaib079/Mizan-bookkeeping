"""Learned description→expense-account mapping (post-launch P2)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountType
from app.core.expenses.items import _ensure_alias, _get_active_item
from app.core.expenses.normalize import (
    FUZZY_MATCH_THRESHOLD,
    normalize_expense_item_text,
    similarity_score,
)
from app.db.session import require_entity_context
from app.features.expenses.models import ExpenseItem, ExpenseItemAlias


@dataclass(frozen=True, slots=True)
class ExpenseAccountSuggestion:
    account_id: uuid.UUID
    source: Literal["learned", "ai"]
    confidence: Literal["high", "medium", "low"]


def _find_item_with_account_and_similar_name(
    session: Session,
    entity_id: uuid.UUID,
    normalized: str,
    expense_account_id: uuid.UUID,
) -> ExpenseItem | None:
    items = session.scalars(
        select(ExpenseItem).where(
            ExpenseItem.entity_id == entity_id,
            ExpenseItem.is_active.is_(True),
            ExpenseItem.default_expense_account_id == expense_account_id,
        )
    ).all()
    best: ExpenseItem | None = None
    best_score = 0.0
    for item in items:
        score = similarity_score(normalized, item.canonical_name_normalized)
        if score >= FUZZY_MATCH_THRESHOLD and score > best_score:
            best_score = score
            best = item
    return best


def _find_related_item_for_learning(
    session: Session,
    entity_id: uuid.UUID,
    normalized: str,
    expense_account_id: uuid.UUID,
) -> ExpenseItem | None:
    aliases = session.scalars(
        select(ExpenseItemAlias).where(ExpenseItemAlias.entity_id == entity_id)
    ).all()
    best: ExpenseItem | None = None
    best_score = 0.0
    for alias in aliases:
        item = session.get(ExpenseItem, alias.expense_item_id)
        if (
            item is None
            or item.entity_id != entity_id
            or not item.is_active
            or item.default_expense_account_id != expense_account_id
        ):
            continue
        score = similarity_score(normalized, alias.alias_normalized)
        if score >= FUZZY_MATCH_THRESHOLD and score > best_score:
            best_score = score
            best = item

    if best is not None:
        return best

    return _find_item_with_account_and_similar_name(
        session, entity_id, normalized, expense_account_id
    )


def record_expense_account_learning(
    session: Session,
    entity_id: uuid.UUID,
    *,
    written_item_description: str | None,
    expense_account_id: uuid.UUID,
    expense_item_id: uuid.UUID | None,
) -> None:
    """Persist owner-confirmed description→account on the canonical expense item."""
    require_entity_context()
    if not written_item_description or not written_item_description.strip():
        return

    normalized = normalize_expense_item_text(written_item_description)
    if not normalized:
        return

    resolved_item: ExpenseItem | None = None
    if expense_item_id is not None:
        resolved_item = _get_active_item(session, entity_id, expense_item_id)

    # Only merge into an existing item when it is genuinely the SAME thing
    # (name/alias similarity) — NOT merely because it shares the same account.
    # Two distinct items that post to the same account (e.g. "peynir" and
    # "yoğurt" both → groceries) must stay separate, never silently collapse.
    target_item = _find_related_item_for_learning(
        session, entity_id, normalized, expense_account_id
    )
    if target_item is None:
        target_item = resolved_item

    if (
        target_item is not None
        and resolved_item is not None
        and target_item.id != resolved_item.id
    ):
        from app.core.expenses.items import merge_expense_items

        target_item = merge_expense_items(
            session,
            entity_id,
            resolved_item.id,
            target_item.id,
        )

    if target_item is None:
        return

    target_item.default_expense_account_id = expense_account_id
    _ensure_alias(
        session,
        entity_id=entity_id,
        alias_normalized=normalized,
        expense_item_id=target_item.id,
    )
    session.flush()


def suggest_learned_expense_account(
    session: Session,
    entity_id: uuid.UUID,
    description: str,
) -> ExpenseAccountSuggestion | None:
    """Match normalized description against learned aliases → default account."""
    require_entity_context()
    normalized = normalize_expense_item_text(description)
    if not normalized or len(normalized) < 2:
        return None

    alias = session.scalar(
        select(ExpenseItemAlias).where(
            ExpenseItemAlias.entity_id == entity_id,
            ExpenseItemAlias.alias_normalized == normalized,
        )
    )
    if alias is None:
        return None

    item = session.get(ExpenseItem, alias.expense_item_id)
    if (
        item is None
        or item.entity_id != entity_id
        or not item.is_active
        or item.default_expense_account_id is None
    ):
        return None

    return ExpenseAccountSuggestion(
        account_id=item.default_expense_account_id,
        source="learned",
        confidence="high",
    )


def list_expense_accounts_for_entity(
    session: Session,
    entity_id: uuid.UUID,
) -> list[Account]:
    return list(
        session.scalars(
            select(Account)
            .where(
                Account.entity_id == entity_id,
                Account.account_type == AccountType.EXPENSE,
                Account.is_active.is_(True),
            )
            .order_by(Account.code)
        ).all()
    )
