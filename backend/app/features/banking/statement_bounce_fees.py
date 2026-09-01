"""Net fee settlement for payment bounce pairs."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.banking.statement_posting import (
    _validate_bank_gl_account,
    _validate_bank_money_account,
    build_bank_fee_posting_lines,
)
from app.core.chart_of_accounts.default_chart import BANK_CHARGES_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntrySource
from app.core.ledger.posting import PostingLine, prepare_journal_entry
from app.features.banking.statement_models import (
    BankStatement,
    BankStatementLine,
    StatementLineClassification,
    StatementLineStatus,
)


def net_fee_kurus(fee_lines: list[BankStatementLine]) -> int:
    """Signed net: negative means bank paid fees, positive means net refund."""
    return sum(line.amount_kurus for line in fee_lines)


def primary_fee_line_id(fee_lines: list[BankStatementLine]) -> uuid.UUID | None:
    if not fee_lines:
        return None
    for line in fee_lines:
        if line.amount_kurus < 0:
            return line.id
    return fee_lines[0].id


def _posting_lines_for_net_fee(
    *,
    bank_gl_account_id: uuid.UUID,
    bank_charges_account_id: uuid.UUID,
    net_kurus: int,
) -> list[PostingLine]:
    amount = abs(net_kurus)
    if net_kurus < 0:
        return build_bank_fee_posting_lines(
            bank_gl_account_id=bank_gl_account_id,
            bank_charges_account_id=bank_charges_account_id,
            amount_kurus=amount,
        )
    return [
        PostingLine(
            account_id=bank_gl_account_id,
            amount_kurus=amount,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=bank_charges_account_id,
            amount_kurus=amount,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def settle_bounce_fee_lines(
    session: Session,
    entity_id: uuid.UUID,
    statement: BankStatement,
    fee_lines: list[BankStatementLine],
    *,
    bounce_pair_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> uuid.UUID | None:
    """Mark fee components settled; post one journal entry when net is non-zero."""
    if not fee_lines:
        return None

    net = net_fee_kurus(fee_lines)
    journal_id: uuid.UUID | None = None
    posting_line_id: uuid.UUID | None = None

    if net != 0:
        bank_account = _validate_bank_money_account(
            session, entity_id, statement.money_account_id
        )
        _validate_bank_gl_account(session, entity_id, bank_account.gl_account_id)
        bank_charges = session.scalar(
            select(Account).where(Account.code == BANK_CHARGES_CODE)
        )
        if bank_charges is None:
            raise ValueError("Bank charges account not found")

        posting_line_id = primary_fee_line_id(fee_lines)
        anchor = next(line for line in fee_lines if line.id == posting_line_id)
        lines = _posting_lines_for_net_fee(
            bank_gl_account_id=bank_account.gl_account_id,
            bank_charges_account_id=bank_charges.id,
            net_kurus=net,
        )
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            anchor.transaction_date,
            "Payment bounce net fee",
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.BANK_FEE,
        )
        journal_id = journal_entry.id

    for line in fee_lines:
        line.bounce_pair_id = bounce_pair_id
        line.review_reason = None
        if journal_id is not None and line.id == posting_line_id:
            line.classification = StatementLineClassification.BANK_FEE
            line.status = StatementLineStatus.POSTED
            line.journal_entry_id = journal_id
        else:
            line.classification = StatementLineClassification.PAYMENT_BOUNCED
            line.status = StatementLineStatus.CLASSIFIED
            line.journal_entry_id = None

    return journal_id
