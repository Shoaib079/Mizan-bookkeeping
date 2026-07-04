"""Statement classification learning — suggestions, confidence, corrections."""

from __future__ import annotations

import re
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

_DATE_PATTERNS: tuple[str, ...] = (
    r"\b\d{2}[./-]\d{2}[./-]\d{4}\b",
    r"\b\d{4}[./-]\d{2}[./-]\d{2}\b",
    r"\b\d{8}\b",
    r"\b\d{6}\b",
)

_BANK_NOISE_WORDS = frozenset(
    {
        "havale",
        "eft",
        "fast",
        "odeme",
        "ödeme",
        "virman",
        "gonderilen",
        "gönderilen",
        "giden",
        "gelen",
        "aciklama",
        "açıklama",
        "masraf",
        "islem",
        "işlem",
        "banka",
        "sube",
        "şube",
        "ref",
        "referans",
        "numarasi",
        "numara",
        "bsmv",
        "komisyon",
        "payment",
        "deposit",
        "withdrawal",
        "fee",
        "charge",
        "credit",
        "debit",
        "the",
        "tl",
    }
)

_GENERIC_SINGLE_TOKENS = frozenset({"bank", "banka", "fee", "service", "payment", "odeme"})

_MIN_TOKEN_LENGTH = 3


def _bank_match_key(text: str) -> str:
    """Normalized text for learned-token equality/substring checks (ı/i equivalent)."""
    return normalize_expense_item_text(text).replace("ı", "i")


def derive_stable_bank_description_token(text: str) -> str:
    """Reduce a bank line description to stable counterparty tokens."""
    normalized = _bank_match_key(text)
    if not normalized:
        return ""

    for pattern in _DATE_PATTERNS:
        normalized = re.sub(pattern, " ", normalized)
    normalized = re.sub(r"\b\d+[.,]\d{2}\b", " ", normalized)
    normalized = re.sub(r"\d{4,}", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()

    tokens = [
        token
        for token in normalized.split()
        if token not in _BANK_NOISE_WORDS and len(token) >= 2
    ]
    stable = " ".join(tokens).strip()
    if len(stable.split()) == 1 and stable in _GENERIC_SINGLE_TOKENS:
        return ""
    return stable


def _counterparty_overlap_token(description: str, counterparty_name: str) -> str | None:
    """Longest normalized substring of the counterparty name that appears in the description."""
    norm_desc = _bank_match_key(description)
    norm_name = _bank_match_key(counterparty_name)
    if not norm_desc or not norm_name:
        return None

    if norm_name in norm_desc:
        return norm_name

    name_tokens = norm_name.split()
    best = ""
    for start in range(len(name_tokens)):
        for end in range(len(name_tokens), start, -1):
            chunk = " ".join(name_tokens[start:end])
            if len(chunk) >= _MIN_TOKEN_LENGTH and chunk in norm_desc:
                if len(chunk) > len(best):
                    best = chunk
    return best or None


def derive_statement_match_token(
    description: str,
    *,
    match_token: str | None = None,
    counterparty_name: str | None = None,
) -> str | None:
    """Pick a stable learned token — explicit trim, counterparty overlap, then noise-stripped core."""
    if match_token and match_token.strip():
        token = _bank_match_key(match_token)
        return token or None

    if counterparty_name and counterparty_name.strip():
        overlap = _counterparty_overlap_token(description, counterparty_name)
        if overlap:
            return overlap

    stable = derive_stable_bank_description_token(description)
    return stable or None


def _description_matches_token(description: str, token: str) -> bool:
    normalized = _bank_match_key(description)
    if not normalized or not token:
        return False
    if token in normalized:
        return True
    stable = derive_stable_bank_description_token(description)
    return bool(stable and token == stable)


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
    if not _bank_match_key(description):
        return []

    rules = list(session.scalars(select(StatementClassificationRule)))
    return [
        rule
        for rule in rules
        if rule.match_token and _description_matches_token(description, rule.match_token)
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
    counterparty_name: str | None = None,
) -> None:
    """Upsert a learned rule after successful user classification."""
    token = derive_statement_match_token(
        description,
        match_token=match_token,
        counterparty_name=counterparty_name,
    )
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

    explicit = match_token.strip() if match_token and match_token.strip() else None
    reuse = matches[0].match_token if not explicit and matches else None
    forced_token = explicit or reuse

    counterparty_name: str | None = None
    if corrected_supplier_id is not None:
        from app.features.suppliers.models import Supplier

        supplier = session.get(Supplier, corrected_supplier_id)
        if supplier is not None:
            counterparty_name = supplier.name

    learn_classification_rule(
        session,
        description=description,
        classification=corrected_classification,
        supplier_id=corrected_supplier_id,
        match_token=forced_token,
        counterparty_name=counterparty_name,
    )
    learn_token = derive_statement_match_token(
        description,
        match_token=forced_token,
        counterparty_name=counterparty_name,
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
