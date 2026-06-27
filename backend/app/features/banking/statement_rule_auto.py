"""Auto-apply HIGH-confidence classification rules on bank statement import."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.banking import statement_posting
from app.core.ledger.models import JournalEntrySource
from app.core.payables.ledger import OverpaymentError
from app.core.payables import posting as payables_posting
from app.db.session import entity_context, require_entity_context
from app.features.banking.classification_learning import evaluate_rule_match
from app.features.banking.statement_models import (
    BankStatement,
    BankStatementLine,
    StatementLineClassification,
    StatementLineClassificationSource,
    StatementLineStatus,
)

BANK_STATEMENT_LINE_REF = "bank_statement_line"
RULE_AUTO_ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")

_AUTO_POST_CLASSIFICATIONS = frozenset(
    {
        StatementLineClassification.BANK_FEE,
        StatementLineClassification.SUPPLIER_PAYMENT,
    }
)


def _route_rule_needs_review(
    line: BankStatementLine,
    *,
    classification: StatementLineClassification,
    supplier_id: uuid.UUID | None,
    review_reason: str,
) -> None:
    line.classification = classification
    line.status = StatementLineStatus.NEEDS_REVIEW
    line.supplier_id = supplier_id
    line.review_reason = review_reason
    line.classification_source = None
    line.journal_entry_id = None
    line.supplier_ledger_entry_id = None


def _auto_post_bank_fee(
    session: Session,
    entity_id: uuid.UUID,
    *,
    statement: BankStatement,
    line: BankStatementLine,
    money_account_gl_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> None:
    fee_amount = abs(line.amount_kurus)
    result = statement_posting.post_bank_fee(
        session,
        entity_id,
        bank_money_account_id=statement.money_account_id,
        fee_date=line.transaction_date,
        amount_kurus=fee_amount,
        description=line.description,
        actor_id=actor_id,
        source=JournalEntrySource.RULE_AUTO,
    )
    line.classification = StatementLineClassification.BANK_FEE
    line.status = StatementLineStatus.POSTED
    line.journal_entry_id = result.journal_entry.id
    line.classification_source = StatementLineClassificationSource.RULE_AUTO.value


def _auto_apply_supplier_payment(
    session: Session,
    entity_id: uuid.UUID,
    *,
    statement: BankStatement,
    line: BankStatementLine,
    money_account_gl_id: uuid.UUID,
    supplier_id: uuid.UUID,
    actor_id: uuid.UUID,
    find_matching_payment,
    link_payment_to_line,
    route_payment_needs_review,
    find_near_matching_payments,
) -> bool:
    """Returns True when the line was auto-resolved (posted or linked)."""
    if line.amount_kurus >= 0:
        _route_rule_needs_review(
            line,
            classification=StatementLineClassification.SUPPLIER_PAYMENT,
            supplier_id=supplier_id,
            review_reason="supplier_payment requires an outflow",
        )
        return False

    existing = find_matching_payment(
        session,
        supplier_id=supplier_id,
        amount_kurus=line.amount_kurus,
        transaction_date=line.transaction_date,
        exclude_line_id=line.id,
    )
    if existing is not None:
        link_payment_to_line(
            line,
            supplier_id=supplier_id,
            classification=StatementLineClassification.SUPPLIER_PAYMENT,
            payment_entry=existing,
        )
        line.classification_source = StatementLineClassificationSource.RULE_AUTO.value
        return True

    near_matches = find_near_matching_payments(
        session,
        supplier_id=supplier_id,
        amount_kurus=line.amount_kurus,
        transaction_date=line.transaction_date,
        exclude_line_id=line.id,
    )
    if near_matches:
        route_payment_needs_review(
            line,
            supplier_id=supplier_id,
            classification=StatementLineClassification.SUPPLIER_PAYMENT,
            candidates=near_matches,
        )
        return False

    payment_amount = abs(line.amount_kurus)
    try:
        result = payables_posting.post_supplier_payment(
            session,
            entity_id,
            supplier_id,
            payment_date=line.transaction_date,
            amount_kurus=payment_amount,
            description=line.description,
            actor_id=actor_id,
            payment_account_id=money_account_gl_id,
            reference_type=BANK_STATEMENT_LINE_REF,
            reference_id=line.id,
            source=JournalEntrySource.RULE_AUTO,
        )
    except OverpaymentError:
        _route_rule_needs_review(
            line,
            classification=StatementLineClassification.SUPPLIER_PAYMENT,
            supplier_id=supplier_id,
            review_reason="Learned supplier payment exceeds payable balance",
        )
        return False

    line.classification = StatementLineClassification.SUPPLIER_PAYMENT
    line.status = StatementLineStatus.POSTED
    line.supplier_id = supplier_id
    line.journal_entry_id = result.journal_entry.id
    line.supplier_ledger_entry_id = result.supplier_ledger_entry.id
    line.classification_source = StatementLineClassificationSource.RULE_AUTO.value
    return True


def try_auto_apply_line(
    session: Session,
    entity_id: uuid.UUID,
    *,
    statement: BankStatement,
    line: BankStatementLine,
    money_account_gl_id: uuid.UUID,
    actor_id: uuid.UUID,
    find_matching_payment,
    link_payment_to_line,
    route_payment_needs_review,
    find_near_matching_payments,
) -> bool:
    """Apply a single HIGH-confidence rule to an imported line. Returns True if resolved."""
    evaluation = evaluate_rule_match(session, line.description)
    if evaluation.best_rule is None:
        return False

    rule = evaluation.best_rule
    if evaluation.conflict or not evaluation.high_confidence:
        reason = (
            "Conflicting learned classification rules"
            if evaluation.conflict
            else f"Learned rule confidence is {evaluation.suggestion.confidence if evaluation.suggestion else 'low'}"
        )
        _route_rule_needs_review(
            line,
            classification=rule.classification,
            supplier_id=rule.supplier_id,
            review_reason=reason,
        )
        return False

    if rule.classification not in _AUTO_POST_CLASSIFICATIONS:
        _route_rule_needs_review(
            line,
            classification=rule.classification,
            supplier_id=rule.supplier_id,
            review_reason="Learned classification requires manual review before posting",
        )
        return False

    if rule.classification == StatementLineClassification.BANK_FEE:
        if line.amount_kurus >= 0:
            _route_rule_needs_review(
                line,
                classification=rule.classification,
                supplier_id=None,
                review_reason="bank_fee requires an outflow",
            )
            return False
        _auto_post_bank_fee(
            session,
            entity_id,
            statement=statement,
            line=line,
            money_account_gl_id=money_account_gl_id,
            actor_id=actor_id,
        )
        return True

    if rule.classification == StatementLineClassification.SUPPLIER_PAYMENT:
        if rule.supplier_id is None:
            _route_rule_needs_review(
                line,
                classification=rule.classification,
                supplier_id=None,
                review_reason="Learned supplier_payment rule has no supplier",
            )
            return False
        return _auto_apply_supplier_payment(
            session,
            entity_id,
            statement=statement,
            line=line,
            money_account_gl_id=money_account_gl_id,
            supplier_id=rule.supplier_id,
            actor_id=actor_id,
            find_matching_payment=find_matching_payment,
            link_payment_to_line=link_payment_to_line,
            route_payment_needs_review=route_payment_needs_review,
            find_near_matching_payments=find_near_matching_payments,
        )

    return False


def apply_import_rule_auto(
    session: Session,
    entity_id: uuid.UUID,
    statement_id: uuid.UUID,
    *,
    actor_id: uuid.UUID = RULE_AUTO_ACTOR_ID,
    find_matching_payment,
    link_payment_to_line,
    route_payment_needs_review,
    find_near_matching_payments,
    get_bank_money_account,
) -> None:
    """After import, auto-post or route to review for each IMPORTED line."""
    with entity_context(session, entity_id):
        require_entity_context()
        statement = session.get(BankStatement, statement_id)
        if statement is None:
            return

        money_account = get_bank_money_account(session, statement.money_account_id)
        lines = list(
            session.scalars(
                select(BankStatementLine)
                .where(
                    BankStatementLine.statement_id == statement_id,
                    BankStatementLine.status == StatementLineStatus.IMPORTED,
                )
                .order_by(BankStatementLine.transaction_date, BankStatementLine.id)
            )
        )
        if not lines:
            return

        for line in lines:
            try_auto_apply_line(
                session,
                entity_id,
                statement=statement,
                line=line,
                money_account_gl_id=money_account.gl_account_id,
                actor_id=actor_id,
                find_matching_payment=find_matching_payment,
                link_payment_to_line=link_payment_to_line,
                route_payment_needs_review=route_payment_needs_review,
                find_near_matching_payments=find_near_matching_payments,
            )
        session.commit()
