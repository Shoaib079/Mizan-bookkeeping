"""Bank loans — the money arriving and the instalments going back.

No counterparty ledger: a loan is the bank's own, so the line carries no id
beyond its journal entry.
"""

from __future__ import annotations

from app.core.banking import statement_posting
from app.features.banking.schema import ClassifyStatementLineResult
from app.features.banking.statement_classify_core import (
    InvalidClassificationError,
    _ClassifyContext,
    _finish_classified_line,
)
from app.features.banking.statement_models import StatementLineClassification


def _post_loan_payment(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    loan_amount = abs(ctx.line.amount_kurus)
    assert ctx.actor_id is not None
    try:
        result = statement_posting.post_loan_payment(
            ctx.session,
            ctx.entity_id,
            bank_money_account_id=ctx.statement.money_account_id,
            payment_date=ctx.line.transaction_date,
            amount_kurus=loan_amount,
            description=ctx.line.description,
            actor_id=ctx.actor_id,
        )
    except (statement_posting.InvalidBankStatementPostError, ValueError) as exc:
        raise InvalidClassificationError(str(exc)) from exc
    journal_id = result.journal_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.LOAN_PAYMENT,
        journal_id,
        match_token=ctx.match_token,
    )


def _post_loan_receipt(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    loan_amount = ctx.line.amount_kurus
    assert ctx.actor_id is not None
    try:
        result = statement_posting.post_loan_receipt(
            ctx.session,
            ctx.entity_id,
            bank_money_account_id=ctx.statement.money_account_id,
            receipt_date=ctx.line.transaction_date,
            amount_kurus=loan_amount,
            description=ctx.line.description,
            actor_id=ctx.actor_id,
        )
    except (statement_posting.InvalidBankStatementPostError, ValueError) as exc:
        raise InvalidClassificationError(str(exc)) from exc
    journal_id = result.journal_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.LOAN_RECEIPT,
        journal_id,
        match_token=ctx.match_token,
    )
