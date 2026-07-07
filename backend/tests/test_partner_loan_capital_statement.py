"""Partner capital contribution and partner-attributed loan statement classifications."""

from __future__ import annotations

from datetime import date

from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    LOANS_PAYABLE_CODE,
    PARTNER_CAPITAL_CODE,
)
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntryLine
from app.core.onboarding.posting import post_opening_balances
from app.core.partners import ledger as partner_ledger
from app.core.partners.types import PartnerMovementType
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    StatementLineClassification,
    StatementLineStatus,
)
from app.features.onboarding.opening_balances import OpeningBalanceLineInput

from tests.test_partners import ACTOR_ID
from tests.test_partners import partner_setup  # noqa: F401 — pytest fixture


def _bank_with_balance(db_session, entity_id):
    bank = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.BANK, name="Garanti TRY"),
    )
    post_opening_balances(
        db_session,
        entity_id,
        go_live_date=date(2026, 1, 1),
        lines=[OpeningBalanceLineInput(money_account_id=bank.id, amount_kurus=5_000_000)],
        actor_id=ACTOR_ID,
    )
    return bank


def _gl_balance(db_session, entity_id, account_id, normal: AccountNormalBalance) -> int:
    with entity_context(db_session, entity_id):
        rows = db_session.execute(
            select(JournalEntryLine.side, func.sum(JournalEntryLine.amount_kurus))
            .where(JournalEntryLine.account_id == account_id)
            .group_by(JournalEntryLine.side)
        ).all()
        debits = credits = 0
        for side, total in rows:
            if side == AccountNormalBalance.DEBIT:
                debits = int(total or 0)
            else:
                credits = int(total or 0)
        if normal == AccountNormalBalance.CREDIT:
            return credits - debits
        return debits - credits


def _amount_csv(kurus: int, *, negative: bool = False) -> str:
    lira = kurus // 100
    formatted = f"{lira:,}".replace(",", ".") + ",00"
    return f"-{formatted}" if negative else formatted


def _import_inflow_line(db_session, entity_id, bank, amount_kurus: int, description: str):
    amount_str = _amount_csv(amount_kurus)
    csv = (
        "transaction_date,amount,description,reference\n"
        f'2026-06-01,"{amount_str}",{description},REF-1\n'
    ).encode()
    return statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="inflow.csv",
    )


def _import_outflow_line(db_session, entity_id, bank, amount_kurus: int, description: str):
    amount_str = _amount_csv(amount_kurus, negative=True)
    csv = (
        "transaction_date,amount,description,reference\n"
        f'2026-06-02,"{amount_str}",{description},REF-2\n'
    ).encode()
    return statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="outflow.csv",
    )


def test_partner_capital_contribution_posts_to_3300(db_session, partner_setup) -> None:
    entity_id = partner_setup["entity_id"]
    partner_id = partner_setup["partner_id"]
    accounts = partner_setup["accounts"]
    bank = _bank_with_balance(db_session, entity_id)

    statement = _import_inflow_line(
        db_session, entity_id, bank, 1_000_000, "ORTAK SERMAYE"
    )
    line_id = statement.lines[0].id

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line_id,
        classification=StatementLineClassification.PARTNER_CAPITAL_CONTRIBUTION,
        partner_id=partner_id,
        actor_id=ACTOR_ID,
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.line.partner_id == partner_id
    assert (
        _gl_balance(
            db_session,
            entity_id,
            accounts[PARTNER_CAPITAL_CODE],
            AccountNormalBalance.CREDIT,
        )
        == 1_000_000
    )
    assert partner_ledger.loan_balance_kurus(db_session, entity_id, partner_id) == 0


def test_partner_loan_receipt_and_repayment_tracked_per_partner(
    db_session, partner_setup
) -> None:
    entity_id = partner_setup["entity_id"]
    partner_id = partner_setup["partner_id"]
    accounts = partner_setup["accounts"]
    bank = _bank_with_balance(db_session, entity_id)

    receipt_stmt = _import_inflow_line(
        db_session, entity_id, bank, 500_000, "ORTAK KREDI"
    )
    receipt_result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        receipt_stmt.id,
        receipt_stmt.lines[0].id,
        classification=StatementLineClassification.PARTNER_LOAN_RECEIPT,
        partner_id=partner_id,
        actor_id=ACTOR_ID,
    )

    assert receipt_result.line.status == StatementLineStatus.POSTED
    assert (
        _gl_balance(
            db_session,
            entity_id,
            accounts[LOANS_PAYABLE_CODE],
            AccountNormalBalance.CREDIT,
        )
        == 500_000
    )
    assert partner_ledger.loan_balance_kurus(db_session, entity_id, partner_id) == 500_000

    payment_stmt = _import_outflow_line(
        db_session, entity_id, bank, 200_000, "ORTAK KREDI ODEME"
    )
    payment_result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        payment_stmt.id,
        payment_stmt.lines[0].id,
        classification=StatementLineClassification.PARTNER_LOAN_PAYMENT,
        partner_id=partner_id,
        actor_id=ACTOR_ID,
    )

    assert payment_result.line.status == StatementLineStatus.POSTED
    assert (
        _gl_balance(
            db_session,
            entity_id,
            accounts[LOANS_PAYABLE_CODE],
            AccountNormalBalance.CREDIT,
        )
        == 300_000
    )
    assert partner_ledger.loan_balance_kurus(db_session, entity_id, partner_id) == 300_000

    with entity_context(db_session, entity_id):
        movement_types = {
            row.movement_type
            for row in partner_ledger.list_ledger_entries(
                db_session, entity_id, partner_id
            )
        }
    assert PartnerMovementType.PARTNER_LOAN_RECEIVED in movement_types
    assert PartnerMovementType.PARTNER_LOAN_REPAID in movement_types


def test_generic_loan_receipt_still_posts_without_partner(db_session, partner_setup) -> None:
    entity_id = partner_setup["entity_id"]
    accounts = partner_setup["accounts"]
    bank = _bank_with_balance(db_session, entity_id)

    statement = _import_inflow_line(db_session, entity_id, bank, 750_000, "BANKA KREDI")
    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        statement.lines[0].id,
        classification=StatementLineClassification.LOAN_RECEIPT,
        actor_id=ACTOR_ID,
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.line.partner_id is None
    assert (
        _gl_balance(
            db_session,
            entity_id,
            accounts[LOANS_PAYABLE_CODE],
            AccountNormalBalance.CREDIT,
        )
        == 750_000
    )
