"""Partner capital and loan movements are correctable via the dedicated route.

Owner decision 2026-08-21: mistyped capital amounts need Edit (void-and-reenter
was too heavy). Partner loans are the same two-line / one-subledger class, so
all three sources flipped together.

Behaviour change: `test_capital_contribution_is_still_refused` previously
guarded refusal; capital is now correctable on the partner ledger route and
still refused on the generic ledger correct.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import (
    LOANS_PAYABLE_CODE,
    PARTNER_CAPITAL_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import ChartAlreadySeededError, seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.correction import CorrectionNotFoundError, SubledgerBackedCorrectionError
from app.core.ledger.correction.registry import (
    DEDICATED_CORRECTION_ROUTES,
    VOID_AND_REENTER_SOURCES,
)
from app.core.ledger.models import JournalEntry, JournalEntrySource, JournalEntryStatus
from app.core.ledger.subledger_display import SubledgerDisplayKind
from app.core.partners import ledger as partner_ledger
from app.core.partners import posting as partner_posting
from app.core.partners.types import PartnerMovementType
from app.db.session import entity_context
from app.features.ledger import service as ledger_service
from app.features.ledger.schema import CorrectJournalEntryRequest, PostingLineIn
from app.features.partners import service as partner_service
from app.features.partners.schema import PartnerCreate, PartnerJournalEntryCorrect
from tests.control_account_tie import books_balanced, gl_liability_balance
from tests.delivery_helpers import ACTOR_ID

CAPITAL = 500_000
LOAN = 800_000
CORRECTED_CAPITAL = 600_000
CORRECTED_LOAN = 700_000


@pytest.fixture(autouse=True)
def _seed(db_session, restaurant_a):
    try:
        seed_default_chart(db_session, restaurant_a.id)
    except ChartAlreadySeededError:
        pass


def _accounts(db_session, entity_id):
    with entity_context(db_session, entity_id):
        return {a.code: a.id for a in db_session.scalars(select(Account))}


def _partner(db_session, entity_id):
    return partner_service.create_partner(
        db_session,
        entity_id,
        PartnerCreate(name="Capital Edit Partner", ownership_share_pct=Decimal("100")),
    )


def _correct(db_session, entity_id, partner_id, entry_id, cash, amount, *, entry_date=None):
    return partner_service.correct_partner_journal_entry_http(
        db_session,
        entity_id,
        partner_id,
        entry_id,
        PartnerJournalEntryCorrect(
            entry_date=entry_date or date(2026, 8, 14),
            description="Corrected amount",
            actor_id=ACTOR_ID,
            amount_kurus=amount,
            payment_account_id=cash,
        ),
    )


def test_the_three_sources_are_dedicated_not_void_and_reenter():
    for source in (
        JournalEntrySource.PARTNER_CAPITAL_CONTRIBUTION,
        JournalEntrySource.PARTNER_LOAN_RECEIVED,
        JournalEntrySource.PARTNER_LOAN_REPAID,
    ):
        assert source not in VOID_AND_REENTER_SOURCES
        assert source in DEDICATED_CORRECTION_ROUTES


def test_capital_amount_can_be_corrected(db_session, restaurant_a):
    entity_id = restaurant_a.id
    partner = _partner(db_session, entity_id)
    accounts = _accounts(db_session, entity_id)
    cash = accounts["1000"]

    posted = partner_posting.post_capital_contribution(
        db_session,
        entity_id,
        partner.id,
        contribution_date=date(2026, 8, 13),
        amount_kurus=CAPITAL,
        description="Capital in",
        actor_id=ACTOR_ID,
        payment_account_id=cash,
    )
    original_id = posted.journal_entry.id

    out = _correct(
        db_session, entity_id, partner.id, original_id, cash, CORRECTED_CAPITAL
    )

    with entity_context(db_session, entity_id):
        original = db_session.get(JournalEntry, original_id)
        corrected = db_session.get(JournalEntry, out.corrected_journal_entry_id)
        assert original is not None and corrected is not None
        assert original.status == JournalEntryStatus.VOIDED
        assert corrected.status == JournalEntryStatus.POSTED
        assert corrected.amends_entry_id == original_id
        assert original.amended_by_entry_id == corrected.id

    ledger = partner_service.get_partner_ledger(db_session, entity_id, partner.id)
    rows = [
        e
        for e in ledger.entries
        if e.movement_type == PartnerMovementType.CAPITAL_CONTRIBUTION
        and e.display_kind == SubledgerDisplayKind.EFFECTIVE
    ]
    assert [r.amount_kurus for r in rows] == [CORRECTED_CAPITAL]
    assert partner_ledger.capital_balance_kurus(db_session, entity_id, partner.id) == (
        CORRECTED_CAPITAL
    )
    assert partner_ledger.entity_capital_total_kurus(db_session, entity_id) == (
        CORRECTED_CAPITAL
    )
    assert gl_liability_balance(
        db_session, entity_id, accounts[PARTNER_CAPITAL_CODE]
    ) == CORRECTED_CAPITAL
    assert books_balanced(db_session, entity_id)


def test_loan_received_amount_can_be_corrected(db_session, restaurant_a):
    entity_id = restaurant_a.id
    partner = _partner(db_session, entity_id)
    accounts = _accounts(db_session, entity_id)
    cash = accounts["1000"]

    posted = partner_posting.post_partner_loan_receipt(
        db_session,
        entity_id,
        partner.id,
        receipt_date=date(2026, 8, 13),
        amount_kurus=LOAN,
        description="Loan in",
        actor_id=ACTOR_ID,
        payment_account_id=cash,
    )
    original_id = posted.journal_entry.id

    out = _correct(
        db_session, entity_id, partner.id, original_id, cash, CORRECTED_LOAN
    )

    with entity_context(db_session, entity_id):
        original = db_session.get(JournalEntry, original_id)
        corrected = db_session.get(JournalEntry, out.corrected_journal_entry_id)
        assert original is not None and corrected is not None
        assert original.status == JournalEntryStatus.VOIDED
        assert corrected.amends_entry_id == original_id

    ledger = partner_service.get_partner_ledger(db_session, entity_id, partner.id)
    rows = [
        e
        for e in ledger.entries
        if e.movement_type == PartnerMovementType.PARTNER_LOAN_RECEIVED
        and e.display_kind == SubledgerDisplayKind.EFFECTIVE
    ]
    assert [r.amount_kurus for r in rows] == [CORRECTED_LOAN]
    assert partner_ledger.loan_balance_kurus(db_session, entity_id, partner.id) == (
        CORRECTED_LOAN
    )
    assert gl_liability_balance(
        db_session, entity_id, accounts[LOANS_PAYABLE_CODE]
    ) == CORRECTED_LOAN
    assert books_balanced(db_session, entity_id)


def test_capital_is_correctable_via_dedicated_route_and_refused_via_generic(
    db_session, restaurant_a
):
    """Replaces test_capital_contribution_is_still_refused (behaviour flip)."""
    entity_id = restaurant_a.id
    partner = _partner(db_session, entity_id)
    accounts = _accounts(db_session, entity_id)
    cash = accounts["1000"]

    posted = partner_posting.post_capital_contribution(
        db_session,
        entity_id,
        partner.id,
        contribution_date=date(2026, 8, 13),
        amount_kurus=CAPITAL,
        description="Capital in",
        actor_id=ACTOR_ID,
        payment_account_id=cash,
    )
    entry_id = posted.journal_entry.id

    with pytest.raises(SubledgerBackedCorrectionError, match="partner capital"):
        ledger_service.correct_entry(
            db_session,
            entity_id,
            entry_id,
            CorrectJournalEntryRequest(
                entry_date=date(2026, 8, 14),
                description="Generic should refuse",
                actor_id=ACTOR_ID,
                lines=[
                    PostingLineIn(
                        account_id=cash,
                        amount_kurus=CORRECTED_CAPITAL,
                        side=AccountNormalBalance.DEBIT,
                    ),
                    PostingLineIn(
                        account_id=accounts[PARTNER_CAPITAL_CODE],
                        amount_kurus=CORRECTED_CAPITAL,
                        side=AccountNormalBalance.CREDIT,
                    ),
                ],
            ),
        )

    dedicated = _correct(
        db_session, entity_id, partner.id, entry_id, cash, CORRECTED_CAPITAL
    )
    assert dedicated.corrected_journal_entry_id is not None


def test_generic_http_correct_refuses_capital(
    client: TestClient, db_session, restaurant_a
):
    entity_id = restaurant_a.id
    partner = _partner(db_session, entity_id)
    accounts = _accounts(db_session, entity_id)
    cash = accounts["1000"]

    posted = partner_posting.post_capital_contribution(
        db_session,
        entity_id,
        partner.id,
        contribution_date=date(2026, 8, 13),
        amount_kurus=CAPITAL,
        description="Capital in",
        actor_id=ACTOR_ID,
        payment_account_id=cash,
    )

    response = client.post(
        f"/entities/{entity_id}/ledger/entries/{posted.journal_entry.id}/correct",
        json={
            "entry_date": "2026-08-14",
            "description": "Should fail",
            "actor_id": str(ACTOR_ID),
            "lines": [
                {
                    "account_id": str(cash),
                    "amount_kurus": CORRECTED_CAPITAL,
                    "side": "debit",
                },
                {
                    "account_id": str(accounts[PARTNER_CAPITAL_CODE]),
                    "amount_kurus": CORRECTED_CAPITAL,
                    "side": "credit",
                },
            ],
        },
    )
    assert response.status_code == 409
    assert "partner capital" in response.json()["detail"]


def test_loan_repayment_cannot_exceed_outstanding(db_session, restaurant_a):
    entity_id = restaurant_a.id
    partner = _partner(db_session, entity_id)
    accounts = _accounts(db_session, entity_id)
    cash = accounts["1000"]

    partner_posting.post_partner_loan_receipt(
        db_session,
        entity_id,
        partner.id,
        receipt_date=date(2026, 8, 10),
        amount_kurus=LOAN,
        description="Loan in",
        actor_id=ACTOR_ID,
        payment_account_id=cash,
    )
    repaid = partner_posting.post_partner_loan_payment(
        db_session,
        entity_id,
        partner.id,
        payment_date=date(2026, 8, 12),
        amount_kurus=300_000,
        description="Partial repay",
        actor_id=ACTOR_ID,
        payment_account_id=cash,
    )

    with pytest.raises(ValueError, match="exceeds partner loan balance"):
        _correct(
            db_session,
            entity_id,
            partner.id,
            repaid.journal_entry.id,
            cash,
            LOAN + 1,
            entry_date=date(2026, 8, 12),
        )


def test_wrong_partner_correct_is_not_found(db_session, restaurant_a):
    entity_id = restaurant_a.id
    partner_a = _partner(db_session, entity_id)
    partner_a_id = partner_a.id
    partner_b = partner_service.create_partner(
        db_session,
        entity_id,
        PartnerCreate(name="Other Partner"),
    )
    partner_b_id = partner_b.id
    accounts = _accounts(db_session, entity_id)
    cash = accounts["1000"]

    posted = partner_posting.post_capital_contribution(
        db_session,
        entity_id,
        partner_a_id,
        contribution_date=date(2026, 8, 13),
        amount_kurus=CAPITAL,
        description="Capital in",
        actor_id=ACTOR_ID,
        payment_account_id=cash,
    )

    with pytest.raises(CorrectionNotFoundError):
        _correct(
            db_session,
            entity_id,
            partner_b_id,
            posted.journal_entry.id,
            cash,
            CORRECTED_CAPITAL,
        )
