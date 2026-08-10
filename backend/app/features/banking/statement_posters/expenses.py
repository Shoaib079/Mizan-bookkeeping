"""Money out with no counterparty ledger behind it — and one exception.

Bank charges, POS commission, rent and utilities, a store purchase. Other
income sits here too: it is the mirror image, and it was the one
classification that recorded no learned rule until 10 Aug.
"""

from __future__ import annotations

from app.core.banking import statement_posting
from app.core.chart_of_accounts.default_chart import CARD_COMMISSION_CODE
from app.core.expenses.posting import InvalidExpensePostingError
from app.core.expenses.posting import post_expense_entry
from app.core.ledger.models import JournalEntrySource
from app.core.ledger.posting import InvalidAccountError
from app.features.banking.schema import ClassifyStatementLineResult
from app.features.banking.statement_classify_core import (
    InvalidClassificationError,
    _ClassifyContext,
    _finish_classified_line,
)
from app.features.banking.statement_models import StatementLineClassification


def _post_bank_fee(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    fee_amount = abs(ctx.line.amount_kurus)
    assert ctx.actor_id is not None
    result = statement_posting.post_bank_fee(
        ctx.session,
        ctx.entity_id,
        bank_money_account_id=ctx.statement.money_account_id,
        fee_date=ctx.line.transaction_date,
        amount_kurus=fee_amount,
        description=ctx.line.description,
        actor_id=ctx.actor_id,
    )
    journal_id = result.journal_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.BANK_FEE,
        journal_id,
        match_token=ctx.match_token,
    )


def _post_pos_commission(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    commission_amount = abs(ctx.line.amount_kurus)
    assert ctx.actor_id is not None
    # Card commission is money the bank took out of the account — Dr 5310 / Cr bank,
    # exactly like a bank fee but to the dedicated Card Commission account.
    result = statement_posting.post_bank_fee(
        ctx.session,
        ctx.entity_id,
        bank_money_account_id=ctx.statement.money_account_id,
        fee_date=ctx.line.transaction_date,
        amount_kurus=commission_amount,
        description=ctx.line.description,
        actor_id=ctx.actor_id,
        source=JournalEntrySource.POS_COMMISSION_STATEMENT,
        charges_account_code=CARD_COMMISSION_CODE,
    )
    journal_id = result.journal_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.POS_COMMISSION,
        journal_id,
        match_token=ctx.match_token,
    )


def _post_other_income(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    assert ctx.actor_id is not None
    assert ctx.income_account_id is not None
    try:
        result = statement_posting.post_bank_income(
            ctx.session,
            ctx.entity_id,
            bank_money_account_id=ctx.statement.money_account_id,
            income_date=ctx.line.transaction_date,
            amount_kurus=abs(ctx.line.amount_kurus),
            income_account_id=ctx.income_account_id,
            description=ctx.line.description,
            actor_id=ctx.actor_id,
        )
    except (InvalidAccountError, ValueError) as exc:
        raise InvalidClassificationError(str(exc)) from exc

    journal_id = result.journal_entry.id
    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.OTHER_INCOME,
        journal_id,
        match_token=ctx.match_token,
    )


def _post_rent_utility(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    expense_amount = abs(ctx.line.amount_kurus)
    assert ctx.actor_id is not None
    assert ctx.expense_account_id is not None
    try:
        result = post_expense_entry(
            ctx.session,
            ctx.entity_id,
            expense_date=ctx.line.transaction_date,
            amount_kurus=expense_amount,
            expense_account_id=ctx.expense_account_id,
            money_account_id=ctx.statement.money_account_id,
            description=ctx.line.description,
            actor_id=ctx.actor_id,
            bank_statement_line_id=ctx.line.id,
        )
    except (InvalidExpensePostingError, ValueError) as exc:
        raise InvalidClassificationError(str(exc)) from exc

    journal_id = result.journal_entry.id
    expense_id = result.expense_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.RENT_UTILITY,
        journal_id,
        match_token=ctx.match_token,
        links={
            "expense_entry_id": expense_id,
        },
        learn_expense_account_id=ctx.expense_account_id,
    )


def _post_store_purchase(ctx: _ClassifyContext) -> ClassifyStatementLineResult:
    expense_amount = abs(ctx.line.amount_kurus)
    assert ctx.actor_id is not None
    assert ctx.expense_account_id is not None
    try:
        result = post_expense_entry(
            ctx.session,
            ctx.entity_id,
            expense_date=ctx.line.transaction_date,
            amount_kurus=expense_amount,
            expense_account_id=ctx.expense_account_id,
            money_account_id=ctx.statement.money_account_id,
            description=ctx.line.description,
            actor_id=ctx.actor_id,
            bank_statement_line_id=ctx.line.id,
            has_source_document=False,
        )
    except (InvalidExpensePostingError, ValueError) as exc:
        raise InvalidClassificationError(str(exc)) from exc

    journal_id = result.journal_entry.id
    expense_id = result.expense_entry.id

    return _finish_classified_line(
        ctx.session,
        ctx.entity_id,
        ctx.line_id,
        StatementLineClassification.STORE_PURCHASE,
        journal_id,
        match_token=ctx.match_token,
        links={
            "expense_entry_id": expense_id,
        },
        learn_expense_account_id=ctx.expense_account_id,
    )
