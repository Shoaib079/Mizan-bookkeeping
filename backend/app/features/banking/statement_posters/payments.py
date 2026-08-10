"""Classifications that settle something already recorded elsewhere.

A supplier or customer payment, a POS or delivery settlement, a credit card
bill. Each links the statement line to the record it settles, which is why
these are the posters that pass a `links` entry.
"""

from __future__ import annotations

from app.core.banking import statement_posting
from app.core.delivery import posting as delivery_posting
from app.core.payables import posting as payables_posting
from app.core.pos import posting as pos_posting
from app.core.receivables import posting as receivables_posting
from app.features.banking.schema import ClassifyStatementLineResult
from app.features.banking.statement_classify_core import (
    BANK_STATEMENT_LINE_REF,
    _ClassifyContext,
    _finish_classified_line,
)
from app.features.banking.statement_models import StatementLineClassification


def _post_supplier_payment(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    payment_amount = abs(ctx.line.amount_kurus)
    result = payables_posting.post_supplier_payment(
        ctx.session,
        ctx.entity_id,
        ctx.supplier_id,
        payment_date=ctx.line.transaction_date,
        amount_kurus=payment_amount,
        description=ctx.line.description,
        actor_id=ctx.actor_id,
        payment_account_id=ctx.money_account.gl_account_id,
        reference_type=BANK_STATEMENT_LINE_REF,
        reference_id=ctx.line.id,
        skip_advance_confirm=True,
    )
    journal_id = result.journal_entry.id
    supplier_ledger_id = result.supplier_ledger_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.SUPPLIER_PAYMENT,
        journal_id,
        match_token=ctx.match_token,
        links={
            "supplier_ledger_entry_id": supplier_ledger_id,
            "supplier_id": ctx.supplier_id,
        },
        learn_supplier_id=ctx.supplier_id,
    )


def _post_customer_payment(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    payment_amount = ctx.line.amount_kurus
    assert ctx.customer_id is not None
    assert ctx.actor_id is not None
    result = receivables_posting.post_customer_payment(
        ctx.session,
        ctx.entity_id,
        ctx.customer_id,
        payment_date=ctx.line.transaction_date,
        amount_kurus=payment_amount,
        description=ctx.line.description,
        actor_id=ctx.actor_id,
        payment_account_id=ctx.money_account.gl_account_id,
        reference_type=BANK_STATEMENT_LINE_REF,
        reference_id=ctx.line.id,
    )
    journal_id = result.journal_entry.id
    customer_ledger_id = result.customer_ledger_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.CUSTOMER_PAYMENT,
        journal_id,
        match_token=ctx.match_token,
        links={
            "customer_id": ctx.customer_id,
            "customer_ledger_entry_id": customer_ledger_id,
        },
    )


def _post_pos_settlement(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    settlement_amount = ctx.line.amount_kurus
    assert ctx.actor_id is not None
    result = pos_posting.post_pos_settlement(
        ctx.session,
        ctx.entity_id,
        money_account_id=ctx.statement.money_account_id,
        settlement_date=ctx.line.transaction_date,
        amount_kurus=settlement_amount,
        description=ctx.line.description,
        actor_id=ctx.actor_id,
        reference_type=BANK_STATEMENT_LINE_REF,
        reference_id=ctx.line.id,
        bank_statement_line_id=ctx.line.id,
    )
    journal_id = result.journal_entry.id
    settlement_id = result.pos_settlement.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.POS_SETTLEMENT,
        journal_id,
        match_token=ctx.match_token,
        links={
            "pos_settlement_id": settlement_id,
        },
    )


def _post_delivery_settlement(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    settlement_amount = ctx.line.amount_kurus
    assert ctx.actor_id is not None
    assert ctx.delivery_platform_id is not None
    result = delivery_posting.post_delivery_settlement(
        ctx.session,
        ctx.entity_id,
        delivery_platform_id=ctx.delivery_platform_id,
        money_account_id=ctx.statement.money_account_id,
        settlement_date=ctx.line.transaction_date,
        amount_kurus=settlement_amount,
        description=ctx.line.description,
        actor_id=ctx.actor_id,
        reference_type=BANK_STATEMENT_LINE_REF,
        reference_id=ctx.line.id,
        bank_statement_line_id=ctx.line.id,
    )
    journal_id = result.journal_entry.id
    settlement_id = result.delivery_settlement.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.DELIVERY_SETTLEMENT,
        journal_id,
        match_token=ctx.match_token,
        links={
            "delivery_settlement_id": settlement_id,
        },
        learn_delivery_platform_id=ctx.delivery_platform_id,
    )


def _post_credit_card_payment(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    payment_amount = abs(ctx.line.amount_kurus)
    assert ctx.actor_id is not None
    assert ctx.credit_card_money_account_id is not None
    result = statement_posting.post_credit_card_payment(
        ctx.session,
        ctx.entity_id,
        credit_card_money_account_id=ctx.credit_card_money_account_id,
        bank_money_account_id=ctx.statement.money_account_id,
        payment_date=ctx.line.transaction_date,
        amount_kurus=payment_amount,
        description=ctx.line.description,
        actor_id=ctx.actor_id,
        bank_statement_line_id=ctx.line.id,
    )
    journal_id = result.journal_entry.id
    payment_id = result.credit_card_payment.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.CREDIT_CARD_PAYMENT,
        journal_id,
        match_token=ctx.match_token,
        links={
            "credit_card_payment_id": payment_id,
        },
    )
