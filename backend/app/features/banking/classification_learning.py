"""Statement classification learning — read suggestions, write rules on confirm."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.expenses.normalize import normalize_expense_item_text
from app.db.base import utcnow
from app.features.banking.classification_rule_models import StatementClassificationRule
from app.features.banking.schema import ClassificationSuggestion
from app.features.banking.statement_models import StatementLineClassification


def _confidence_label(confirmation_count: int) -> str:
    if confirmation_count >= 3:
        return "high"
    if confirmation_count >= 2:
        return "medium"
    return "low"


def _rule_signature(
    rule: StatementClassificationRule,
) -> tuple[StatementLineClassification, uuid.UUID | None]:
    return (rule.classification, rule.supplier_id)


def suggest_classification(
    session: Session,
    description: str,
) -> ClassificationSuggestion | None:
    """Read-only: best matching rule for a line description, or None."""
    normalized_description = normalize_expense_item_text(description)
    if not normalized_description:
        return None

    rules = list(session.scalars(select(StatementClassificationRule)))
    matches = [
        rule
        for rule in rules
        if rule.match_token and rule.match_token in normalized_description
    ]
    if not matches:
        return None

    signatures = {_rule_signature(rule) for rule in matches}
    if len(signatures) > 1:
        return None

    best = max(matches, key=lambda rule: (rule.confirmation_count, len(rule.match_token)))
    return ClassificationSuggestion(
        classification=best.classification,
        supplier_id=best.supplier_id,
        reason=(
            f"Matched learned token {best.match_token!r} "
            f"({best.confirmation_count} prior confirmation"
            f"{'s' if best.confirmation_count != 1 else ''})"
        ),
        confidence=_confidence_label(best.confirmation_count),
    )


def learn_classification_rule(
    session: Session,
    *,
    description: str,
    classification: StatementLineClassification,
    supplier_id: uuid.UUID | None = None,
    match_token: str | None = None,
) -> None:
    """Upsert a learned rule after successful user classification."""
    token = normalize_expense_item_text(match_token or description)
    if not token:
        return

    rule_supplier_id: uuid.UUID | None = None
    if classification == StatementLineClassification.SUPPLIER_PAYMENT:
        rule_supplier_id = supplier_id

    now = utcnow()
    existing = session.scalar(
        select(StatementClassificationRule).where(
            StatementClassificationRule.match_token == token
        )
    )
    if existing is not None:
        existing.classification = classification
        existing.supplier_id = rule_supplier_id
        existing.confirmation_count += 1
        existing.last_used_at = now
        existing.updated_at = now
        session.flush()
        return

    session.add(
        StatementClassificationRule(
            match_token=token,
            classification=classification,
            supplier_id=rule_supplier_id,
            confirmation_count=1,
            last_used_at=now,
        )
    )
    session.flush()
