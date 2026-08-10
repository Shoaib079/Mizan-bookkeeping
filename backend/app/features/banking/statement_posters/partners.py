"""The seven ways money moves between a partner and the restaurant.

Drawings and their repayment, reimbursement of what a partner fronted,
capital in, profit out, and loans both directions. All seven write
`partner_id` onto the line; the direction and the subledger movement type are
what differ.
"""

from __future__ import annotations

from app.core.partners import posting as partner_posting
from app.core.partners.ledger import OverLoanRepaymentError as PartnerOverLoanRepaymentError
from app.core.partners.ledger import OverProfitPaymentError as PartnerOverProfitPaymentError
from app.core.partners.ledger import OverRepaymentError as PartnerOverRepaymentError
from app.core.partners.ledger import OverpaymentError as PartnerOverpaymentError
from app.features.banking.schema import ClassifyStatementLineResult
from app.features.banking.statement_classify_core import (
    InvalidClassificationError,
    _ClassifyContext,
    _finish_classified_line,
)
from app.features.banking.statement_models import StatementLineClassification


def _post_partner_drawing(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    drawing_amount = abs(ctx.line.amount_kurus)
    assert ctx.actor_id is not None
    assert ctx.partner_id is not None
    try:
        result = partner_posting.post_drawing(
            ctx.session,
            ctx.entity_id,
            ctx.partner_id,
            drawing_date=ctx.line.transaction_date,
            amount_kurus=drawing_amount,
            description=ctx.line.description,
            actor_id=ctx.actor_id,
            payment_account_id=ctx.money_account.gl_account_id,
        )
    except (partner_posting.InvalidPartnerPostingError, ValueError) as exc:
        raise InvalidClassificationError(str(exc)) from exc
    journal_id = result.journal_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.PARTNER_DRAWING,
        journal_id,
        match_token=ctx.match_token,
        links={
            "partner_id": ctx.partner_id,
        },
    )


def _post_partner_reimbursement(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    reimbursement_amount = abs(ctx.line.amount_kurus)
    assert ctx.actor_id is not None
    assert ctx.partner_id is not None
    try:
        result = partner_posting.post_reimbursement_paid(
            ctx.session,
            ctx.entity_id,
            ctx.partner_id,
            payment_date=ctx.line.transaction_date,
            amount_kurus=reimbursement_amount,
            description=ctx.line.description,
            actor_id=ctx.actor_id,
            payment_account_id=ctx.money_account.gl_account_id,
        )
    except (
        partner_posting.InvalidPartnerPostingError,
        PartnerOverpaymentError,
        ValueError,
    ) as exc:
        raise InvalidClassificationError(str(exc)) from exc
    journal_id = result.journal_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.PARTNER_REIMBURSEMENT,
        journal_id,
        match_token=ctx.match_token,
        links={
            "partner_id": ctx.partner_id,
        },
    )


def _post_partner_drawing_repayment(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    repayment_amount = ctx.line.amount_kurus
    assert ctx.actor_id is not None
    assert ctx.partner_id is not None
    try:
        result = partner_posting.post_drawing_repayment(
            ctx.session,
            ctx.entity_id,
            ctx.partner_id,
            payment_date=ctx.line.transaction_date,
            amount_kurus=repayment_amount,
            description=ctx.line.description,
            actor_id=ctx.actor_id,
            payment_account_id=ctx.money_account.gl_account_id,
        )
    except (
        partner_posting.InvalidPartnerPostingError,
        PartnerOverRepaymentError,
        ValueError,
    ) as exc:
        raise InvalidClassificationError(str(exc)) from exc
    journal_id = result.journal_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.PARTNER_DRAWING_REPAYMENT,
        journal_id,
        match_token=ctx.match_token,
        links={
            "partner_id": ctx.partner_id,
        },
    )


def _post_partner_capital_contribution(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    contribution_amount = ctx.line.amount_kurus
    assert ctx.actor_id is not None
    assert ctx.partner_id is not None
    try:
        result = partner_posting.post_capital_contribution(
            ctx.session,
            ctx.entity_id,
            ctx.partner_id,
            contribution_date=ctx.line.transaction_date,
            amount_kurus=contribution_amount,
            description=(ctx.note or "").strip(),
            actor_id=ctx.actor_id,
            payment_account_id=ctx.money_account.gl_account_id,
        )
    except (
        partner_posting.InvalidPartnerPostingError,
        ValueError,
    ) as exc:
        raise InvalidClassificationError(str(exc)) from exc
    journal_id = result.journal_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.PARTNER_CAPITAL_CONTRIBUTION,
        journal_id,
        match_token=ctx.match_token,
        links={
            "partner_id": ctx.partner_id,
        },
    )


def _post_partner_profit_paid(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    payment_amount = abs(ctx.line.amount_kurus)
    assert ctx.actor_id is not None
    assert ctx.partner_id is not None
    try:
        result = partner_posting.post_profit_paid(
            ctx.session,
            ctx.entity_id,
            ctx.partner_id,
            payment_date=ctx.line.transaction_date,
            amount_kurus=payment_amount,
            description=ctx.line.description,
            actor_id=ctx.actor_id,
            payment_account_id=ctx.money_account.gl_account_id,
        )
    except (
        partner_posting.InvalidPartnerPostingError,
        PartnerOverProfitPaymentError,
        ValueError,
    ) as exc:
        raise InvalidClassificationError(str(exc)) from exc
    journal_id = result.journal_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.PARTNER_PROFIT_PAID,
        journal_id,
        match_token=ctx.match_token,
        links={
            "partner_id": ctx.partner_id,
        },
    )


def _post_partner_loan_receipt(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    loan_amount = ctx.line.amount_kurus
    assert ctx.actor_id is not None
    assert ctx.partner_id is not None
    try:
        result = partner_posting.post_partner_loan_receipt(
            ctx.session,
            ctx.entity_id,
            ctx.partner_id,
            receipt_date=ctx.line.transaction_date,
            amount_kurus=loan_amount,
            description=ctx.line.description,
            actor_id=ctx.actor_id,
            payment_account_id=ctx.money_account.gl_account_id,
        )
    except (
        partner_posting.InvalidPartnerPostingError,
        ValueError,
    ) as exc:
        raise InvalidClassificationError(str(exc)) from exc
    journal_id = result.journal_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.PARTNER_LOAN_RECEIPT,
        journal_id,
        match_token=ctx.match_token,
        links={
            "partner_id": ctx.partner_id,
        },
    )


def _post_partner_loan_payment(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    loan_amount = abs(ctx.line.amount_kurus)
    assert ctx.actor_id is not None
    assert ctx.partner_id is not None
    try:
        result = partner_posting.post_partner_loan_payment(
            ctx.session,
            ctx.entity_id,
            ctx.partner_id,
            payment_date=ctx.line.transaction_date,
            amount_kurus=loan_amount,
            description=ctx.line.description,
            actor_id=ctx.actor_id,
            payment_account_id=ctx.money_account.gl_account_id,
        )
    except (
        partner_posting.InvalidPartnerPostingError,
        PartnerOverLoanRepaymentError,
        ValueError,
    ) as exc:
        raise InvalidClassificationError(str(exc)) from exc
    journal_id = result.journal_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.PARTNER_LOAN_PAYMENT,
        journal_id,
        match_token=ctx.match_token,
        links={
            "partner_id": ctx.partner_id,
        },
    )
