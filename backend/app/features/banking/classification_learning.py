"""Statement classification learning — suggestions, confidence, corrections."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.expenses.normalize import normalize_expense_item_text
from app.core.learning import LearningDomain, record_learning_correction
from app.core.learning.confidence import (
    confidence_label as learning_confidence_label,
    is_high_confidence as rule_is_high_confidence,
)
from app.db.base import utcnow
from app.features.banking.classification_rule_models import StatementClassificationRule
from app.features.banking.schema import ClassificationSuggestion
from app.features.banking.statement_models import StatementLineClassification


def _rule_signature(
    rule: StatementClassificationRule,
) -> tuple[StatementLineClassification, uuid.UUID | None]:
    return (rule.classification, rule.supplier_id)


def is_high_confidence(rule: StatementClassificationRule) -> bool:
    """HIGH only when confirmed enough times with no recent correction and stable mapping."""
    return rule_is_high_confidence(
        rule.confirmation_count,
        rule.confirmations_since_correction,
    )


def _confidence_label(rule: StatementClassificationRule) -> str:
    return learning_confidence_label(
        rule.confirmation_count,
        rule.confirmations_since_correction,
    )


def _matching_rules(
    session: Session,
    description: str,
) -> list[StatementClassificationRule]:
    normalized_description = normalize_expense_item_text(description)
    if not normalized_description:
        return []

    rules = list(session.scalars(select(StatementClassificationRule)))
    return [
        rule
        for rule in rules
        if rule.match_token and rule.match_token in normalized_description
    ]


@dataclass(frozen=True)
class RuleMatchEvaluation:
    conflict: bool
    best_rule: StatementClassificationRule | None
    high_confidence: bool
    suggestion: ClassificationSuggestion | None


def evaluate_rule_match(session: Session, description: str) -> RuleMatchEvaluation:
    """Evaluate learned rules for a description — used for suggestions and auto-apply."""
    matches = _matching_rules(session, description)
    if not matches:
        return RuleMatchEvaluation(
            conflict=False,
            best_rule=None,
            high_confidence=False,
            suggestion=None,
        )

    signatures = {_rule_signature(rule) for rule in matches}
    conflict = len(signatures) > 1
    best = max(matches, key=lambda rule: (rule.confirmation_count, len(rule.match_token)))
    suggestion = ClassificationSuggestion(
        classification=best.classification,
        supplier_id=best.supplier_id,
        reason=(
            f"Matched learned token {best.match_token!r} "
            f"({best.confirmation_count} prior confirmation"
            f"{'s' if best.confirmation_count != 1 else ''})"
        ),
        confidence=_confidence_label(best),
    )
    return RuleMatchEvaluation(
        conflict=conflict,
        best_rule=best,
        high_confidence=not conflict and is_high_confidence(best),
        suggestion=suggestion,
    )


def suggest_classification(
    session: Session,
    description: str,
) -> ClassificationSuggestion | None:
    """Read-only: best matching rule for a line description, or None."""
    evaluation = evaluate_rule_match(session, description)
    if evaluation.conflict or evaluation.suggestion is None:
        return None
    return evaluation.suggestion


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
        mapping_changed = (
            existing.classification != classification
            or existing.supplier_id != rule_supplier_id
        )
        existing.classification = classification
        existing.supplier_id = rule_supplier_id
        if mapping_changed:
            existing.confirmation_count = 1
            existing.confirmations_since_correction = 1
        else:
            existing.confirmation_count += 1
            existing.confirmations_since_correction += 1
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
            confirmations_since_correction=1,
            correction_count=0,
            last_used_at=now,
        )
    )
    session.flush()


def record_rule_correction(
    session: Session,
    *,
    description: str,
    corrected_classification: StatementLineClassification,
    corrected_supplier_id: uuid.UUID | None = None,
    match_token: str | None = None,
) -> None:
    """Downgrade offending rules and learn the corrected mapping."""
    token = normalize_expense_item_text(match_token) if match_token else None
    matches = _matching_rules(session, description)
    if token is not None:
        matches = [rule for rule in matches if rule.match_token == token]

    now = utcnow()
    for rule in matches:
        rule.correction_count += 1
        rule.confirmations_since_correction = 0
        rule.updated_at = now

    learn_token = token
    if learn_token is None and matches:
        learn_token = matches[0].match_token
    if learn_token is None:
        normalized_description = normalize_expense_item_text(description)
        learn_token = normalized_description or None

    learn_classification_rule(
        session,
        description=description,
        classification=corrected_classification,
        supplier_id=corrected_supplier_id,
        match_token=learn_token,
    )

    record_learning_correction(
        session,
        domain=LearningDomain.BANK_STATEMENT,
        field_name="classification",
        before_value=matches[0].classification.value if matches else None,
        after_value=corrected_classification.value,
        match_token=learn_token,
    )
    if matches and matches[0].supplier_id != corrected_supplier_id:
        record_learning_correction(
            session,
            domain=LearningDomain.BANK_STATEMENT,
            field_name="supplier_id",
            before_value=str(matches[0].supplier_id) if matches[0].supplier_id else None,
            after_value=str(corrected_supplier_id) if corrected_supplier_id else None,
            match_token=learn_token,
        )

    session.flush()
