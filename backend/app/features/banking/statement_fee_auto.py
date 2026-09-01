"""Bank-fee and card-commission auto-post on statement import (BSF-1 + learning).

Split from statement_rule_auto so the import orchestrator stays under the
file-size ratchet. Clear-commission sweep (1400 residual) stays on Cards —
this module only handles *visible* statement outflows.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.banking import statement_posting
from app.core.banking.bank_fee_detect import (
    is_bank_fee_description,
    is_pos_commission_description,
)
from app.core.chart_of_accounts.default_chart import CARD_COMMISSION_CODE
from app.core.ledger.models import JournalEntrySource
from app.features.banking.bank_fee_settings import get_bank_fee_auto_post_ceiling_kurus
from app.features.banking.classification_learning import (
    RuleMatchEvaluation,
    evaluate_rule_match,
)
from app.features.banking.statement_models import (
    BankStatement,
    BankStatementLine,
    StatementLineClassification,
    StatementLineClassificationSource,
    StatementLineStatus,
)


def _route_fee_needs_review(
    line: BankStatementLine,
    *,
    classification: StatementLineClassification,
    review_reason: str,
) -> None:
    line.classification = classification
    line.status = StatementLineStatus.NEEDS_REVIEW
    line.supplier_id = None
    line.review_reason = review_reason
    line.classification_source = None
    line.journal_entry_id = None
    line.supplier_ledger_entry_id = None


def learned_pos_commission(
    session: Session, description: str
) -> RuleMatchEvaluation | None:
    """Non-conflicting learned card-commission rule for this description, if any."""
    evaluation = evaluate_rule_match(session, description)
    if (
        evaluation.best_rule is None
        or evaluation.conflict
        or evaluation.best_rule.classification
        != StatementLineClassification.POS_COMMISSION
    ):
        return None
    return evaluation


def auto_post_bank_fee(
    session: Session,
    entity_id: uuid.UUID,
    *,
    statement: BankStatement,
    line: BankStatementLine,
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


def auto_post_pos_commission(
    session: Session,
    entity_id: uuid.UUID,
    *,
    statement: BankStatement,
    line: BankStatementLine,
    actor_id: uuid.UUID,
) -> None:
    """Same GL as manual pos_commission classify — Dr 5310 / Cr bank."""
    commission_amount = abs(line.amount_kurus)
    result = statement_posting.post_bank_fee(
        session,
        entity_id,
        bank_money_account_id=statement.money_account_id,
        fee_date=line.transaction_date,
        amount_kurus=commission_amount,
        description=line.description,
        actor_id=actor_id,
        source=JournalEntrySource.POS_COMMISSION_STATEMENT,
        charges_account_code=CARD_COMMISSION_CODE,
    )
    line.classification = StatementLineClassification.POS_COMMISSION
    line.status = StatementLineStatus.POSTED
    line.journal_entry_id = result.journal_entry.id
    line.classification_source = StatementLineClassificationSource.RULE_AUTO.value
    line.review_reason = None


def route_or_auto_post_pos_commission(
    session: Session,
    entity_id: uuid.UUID,
    *,
    statement: BankStatement,
    line: BankStatementLine,
    actor_id: uuid.UUID,
    high_confidence: bool,
) -> None:
    """HIGH learned commission posts; otherwise Needs Review with the right label."""
    if line.amount_kurus >= 0:
        _route_fee_needs_review(
            line,
            classification=StatementLineClassification.POS_COMMISSION,
            review_reason="Card commission requires an outflow",
        )
        return

    commission_amount = abs(line.amount_kurus)
    ceiling = get_bank_fee_auto_post_ceiling_kurus(session, entity_id)
    if high_confidence and commission_amount <= ceiling:
        auto_post_pos_commission(
            session,
            entity_id,
            statement=statement,
            line=line,
            actor_id=actor_id,
        )
        return

    reason = (
        "Card acquirer commission — confirm as card commission (5310), "
        "not bank charges"
        if not high_confidence
        else "Card commission exceeds auto-post ceiling"
    )
    _route_fee_needs_review(
        line,
        classification=StatementLineClassification.POS_COMMISSION,
        review_reason=reason,
    )


def try_auto_post_detected_bank_fee(
    session: Session,
    entity_id: uuid.UUID,
    *,
    statement: BankStatement,
    line: BankStatementLine,
    money_account_gl_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> bool:
    """Fee / card-commission gate on import.

    Deterministic POS-commission wording and *learned* card-commission rules
    win over BSF-1 bank-fee auto-post so correcting bank fee → card commission
    is not undone on the next import. Clear-commission sweep (1400 residual)
    is a separate path for banks that never show commission on the statement.
    """
    del money_account_gl_id  # kept for call-site compatibility with apply_import_rule_auto
    if line.amount_kurus >= 0:
        return False

    learned = learned_pos_commission(session, line.description)
    if learned is not None or is_pos_commission_description(line.description):
        route_or_auto_post_pos_commission(
            session,
            entity_id,
            statement=statement,
            line=line,
            actor_id=actor_id,
            high_confidence=bool(learned and learned.high_confidence),
        )
        return True

    if not is_bank_fee_description(line.description):
        return False

    fee_amount = abs(line.amount_kurus)
    ceiling = get_bank_fee_auto_post_ceiling_kurus(session, entity_id)
    if fee_amount > ceiling:
        _route_fee_needs_review(
            line,
            classification=StatementLineClassification.BANK_FEE,
            review_reason="Bank charge exceeds auto-post ceiling",
        )
        return True

    auto_post_bank_fee(
        session,
        entity_id,
        statement=statement,
        line=line,
        actor_id=actor_id,
    )
    return True
