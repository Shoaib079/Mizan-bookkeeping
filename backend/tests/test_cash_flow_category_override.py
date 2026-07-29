"""A manual journal can say which cash-flow activity it is (FINANCIAL_AUDIT F5).

Categories are inferred from the entry's source, and MANUAL falls through to
"operating". So a manual journal that is really a loan repayment or an
equipment purchase was filed as operating. Totals stayed right — the
reconciliation flag proves the three categories sum back to the real cash
movement — but the split was wrong.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import (
    LOANS_PAYABLE_CODE,
    SALES_REVENUE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntrySource
from app.core.ledger.posting import PostingLine, post_journal_entry
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.reports import cash_flow

ACTOR = uuid.UUID("00000000-0000-4000-8000-000000000001")
FROM = date(2026, 6, 1)
TO = date(2026, 6, 30)


@pytest.fixture
def books(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK, name="Garanti", bank_name="Garanti"
        ),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {"entity_id": restaurant_a.id, "accounts": accounts, "bank": bank}


def _manual(db_session, books, *, amount, category=None, repay_loan=True):
    """Pay money out of the bank — a loan repayment unless told otherwise."""
    other = books["accounts"][
        LOANS_PAYABLE_CODE if repay_loan else SALES_REVENUE_CODE
    ]
    with entity_context(db_session, books["entity_id"]):
        entry = post_journal_entry(
            db_session,
            books["entity_id"],
            date(2026, 6, 15),
            "Loan repayment" if repay_loan else "Misc",
            [
                PostingLine(other, amount, AccountNormalBalance.DEBIT),
                PostingLine(
                    books["bank"].gl_account_id, amount, AccountNormalBalance.CREDIT
                ),
            ],
            actor_id=ACTOR,
            source=JournalEntrySource.MANUAL,
            cash_flow_category=category,
        )
        db_session.commit()
        return entry


def test_a_manual_entry_defaults_to_operating(db_session, books):
    _manual(db_session, books, amount=100_000)
    report = cash_flow.get_cash_flow(db_session, books["entity_id"], FROM, TO)
    assert report.operating.net_kurus == -100_000
    assert report.financing.net_kurus == 0


def test_marking_it_financing_moves_it(db_session, books):
    _manual(db_session, books, amount=100_000, category="financing")
    report = cash_flow.get_cash_flow(db_session, books["entity_id"], FROM, TO)
    assert report.financing.net_kurus == -100_000
    assert report.operating.net_kurus == 0
    assert report.reconciled_to_categories is True


def test_marking_it_investing_moves_it(db_session, books):
    _manual(db_session, books, amount=100_000, category="investing")
    report = cash_flow.get_cash_flow(db_session, books["entity_id"], FROM, TO)
    assert report.investing.net_kurus == -100_000


def test_a_junk_category_is_ignored_rather_than_trusted(db_session, books):
    """A bad string must not silently move money between categories."""
    _manual(db_session, books, amount=100_000, category="nonsense")
    report = cash_flow.get_cash_flow(db_session, books["entity_id"], FROM, TO)
    assert report.operating.net_kurus == -100_000
    assert report.reconciled_to_categories is True


def test_one_source_can_now_appear_in_two_categories(db_session, books):
    """The by-source rows key on (source, category) — a source-only key would
    let the last entry seen relabel all the others."""
    _manual(db_session, books, amount=100_000, category="financing")
    _manual(db_session, books, amount=40_000, repay_loan=False)

    report = cash_flow.get_cash_flow(db_session, books["entity_id"], FROM, TO)
    manual_rows = [r for r in report.by_source if r.source == "manual"]
    assert {r.category for r in manual_rows} == {"financing", "operating"}
    assert sum(r.net_cash_kurus for r in manual_rows) == -140_000
    assert report.reconciled_to_categories is True


def test_totals_never_move_whatever_the_category(db_session, books):
    _manual(db_session, books, amount=100_000, category="financing")
    report = cash_flow.get_cash_flow(db_session, books["entity_id"], FROM, TO)
    assert (
        report.operating.net_kurus
        + report.investing.net_kurus
        + report.financing.net_kurus
        == report.net_change_kurus
    )


def test_entry_category_prefers_the_override(db_session):
    assert (
        cash_flow.entry_category(JournalEntrySource.MANUAL, "financing") == "financing"
    )
    assert cash_flow.entry_category(JournalEntrySource.MANUAL, None) == "operating"
    assert cash_flow.entry_category(JournalEntrySource.MANUAL, "") == "operating"
    # A dedicated source still wins over nothing.
    assert (
        cash_flow.entry_category(JournalEntrySource.FX_PURCHASE, None) == "investing"
    )
