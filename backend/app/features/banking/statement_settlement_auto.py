"""POS settlement resolve on statement import — link if unique, else create.

Owner teaches deposit descriptions via classification rules. We do not add
deterministic “looks like a card deposit” detectors here: learning is the gate.
Matching an existing settlement is optional; multi-bank patchy deposits usually
have none on file, so create+post mirrors manual classify.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.pos import posting as pos_posting
from app.core.pos.posting import InvalidPosSettlementError
from app.features.banking.statement_classify_core import BANK_STATEMENT_LINE_REF
from app.features.banking.statement_models import (
    BankStatement,
    BankStatementLine,
    StatementLineClassification,
    StatementLineClassificationSource,
    StatementLineStatus,
)
from app.features.pos.models import PosSettlement


def list_matching_pos_settlements(
    session: Session,
    *,
    money_account_id: uuid.UUID,
    amount_kurus: int,
    settlement_date: date,
    exclude_line_id: uuid.UUID | None = None,
) -> list[PosSettlement]:
    from app.features.banking.statements import _used_pos_settlement_ids

    used = _used_pos_settlement_ids(session, exclude_line_id=exclude_line_id)
    filters = [
        PosSettlement.money_account_id == money_account_id,
        PosSettlement.settlement_date == settlement_date,
        PosSettlement.amount_kurus == amount_kurus,
    ]
    if used:
        filters.append(PosSettlement.id.not_in(used))
    return list(
        session.scalars(
            select(PosSettlement).where(*filters).order_by(PosSettlement.created_at)
        ).all()
    )


def auto_resolve_pos_settlement(
    session: Session,
    entity_id: uuid.UUID,
    *,
    statement: BankStatement,
    line: BankStatementLine,
    actor_id: uuid.UUID,
    route_needs_review,
) -> bool:
    """Link one unused match, or create+post when none — never invent under conflict."""
    from app.features.banking.statements import (
        _find_matching_pos_settlement,
        _link_pos_settlement_to_line,
    )

    if line.amount_kurus <= 0:
        route_needs_review(
            line,
            classification=StatementLineClassification.POS_SETTLEMENT,
            supplier_id=None,
            review_reason="settlement requires an inflow",
        )
        return False

    matches = list_matching_pos_settlements(
        session,
        money_account_id=statement.money_account_id,
        amount_kurus=line.amount_kurus,
        settlement_date=line.transaction_date,
        exclude_line_id=line.id,
    )
    if len(matches) == 1:
        settlement = _find_matching_pos_settlement(
            session,
            money_account_id=statement.money_account_id,
            amount_kurus=line.amount_kurus,
            settlement_date=line.transaction_date,
            exclude_line_id=line.id,
        )
        assert settlement is not None
        _link_pos_settlement_to_line(line, settlement=settlement)
        line.classification_source = StatementLineClassificationSource.RULE_AUTO.value
        return True

    if len(matches) > 1:
        route_needs_review(
            line,
            classification=StatementLineClassification.POS_SETTLEMENT,
            supplier_id=None,
            review_reason="Multiple POS settlements match — pick the correct one manually",
        )
        return False

    try:
        result = pos_posting.post_pos_settlement(
            session,
            entity_id,
            money_account_id=statement.money_account_id,
            settlement_date=line.transaction_date,
            amount_kurus=line.amount_kurus,
            description=line.description,
            actor_id=actor_id,
            reference_type=BANK_STATEMENT_LINE_REF,
            reference_id=line.id,
            bank_statement_line_id=line.id,
        )
    except InvalidPosSettlementError as exc:
        route_needs_review(
            line,
            classification=StatementLineClassification.POS_SETTLEMENT,
            supplier_id=None,
            review_reason=str(exc),
        )
        return False

    line.classification = StatementLineClassification.POS_SETTLEMENT
    line.status = StatementLineStatus.POSTED
    line.journal_entry_id = result.journal_entry.id
    line.pos_settlement_id = result.pos_settlement.id
    line.classification_source = StatementLineClassificationSource.RULE_AUTO.value
    line.review_reason = None
    return True
