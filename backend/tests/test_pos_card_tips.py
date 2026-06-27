"""POS Z-report reconciliation — match-or-review only (Decisions §9).

When ``card_tips_z_report_enabled`` is on, the card-terminal Z total must equal the
system card sale before posting. Tips are **not** derived or posted at POS — they
belong on the expense list (``Dr <chosen expense> / Cr cash`` via the expenses pipeline).
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    CARD_SALES_CLEARING_CODE,
    GENERAL_EXPENSE_CODE,
    SALES_REVENUE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.core.pos import posting as pos_posting
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.entities import service as entity_service
from app.features.entities.schema import EntitySettingCreate
from app.features.pos.daily_summary_service import _z_mismatch_review_reason
from app.features.pos.settings import CARD_TIPS_Z_REPORT_ENABLED_KEY

FIXTURES = __import__("pathlib").Path(__file__).resolve().parent / "fixtures" / "pos"
SAMPLE_SUMMARY = FIXTURES / "sample_summary.txt"

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")

# sample_summary.txt: cash 150_000, card 350_000, total 500_000
SYSTEM_CARD_KURUS = 350_000
TIP_KURUS = 10_000
Z_ABOVE_CARD = SYSTEM_CARD_KURUS + TIP_KURUS


def _enable_z_report(db_session, entity_id) -> None:
    entity_service.create_entity_setting(
        db_session,
        entity_id,
        EntitySettingCreate(key=CARD_TIPS_Z_REPORT_ENABLED_KEY, value="true"),
    )


@pytest.fixture
def setup(db_session, restaurant_a):
    seed_default_chart = __import__(
        "app.core.chart_of_accounts.seed", fromlist=["seed_default_chart"]
    ).seed_default_chart
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK, name="Garanti TRY", bank_name="Garanti"
        ),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "bank": bank,
        "accounts": accounts,
    }


def _gl_balance(db_session, entity_id, account_id) -> int:
    """Signed debit-positive balance for an account."""
    with entity_context(db_session, entity_id):
        debit = int(
            db_session.scalar(
                select(func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0)).where(
                    JournalEntryLine.account_id == account_id,
                    JournalEntryLine.side == AccountNormalBalance.DEBIT,
                )
            )
            or 0
        )
        credit = int(
            db_session.scalar(
                select(func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0)).where(
                    JournalEntryLine.account_id == account_id,
                    JournalEntryLine.side == AccountNormalBalance.CREDIT,
                )
            )
            or 0
        )
    return debit - credit


def _upload(client, entity_id) -> str:
    upload = client.post(
        f"/entities/{entity_id}/pos/daily-summaries",
        files={"file": ("summary.txt", SAMPLE_SUMMARY.read_bytes(), "text/plain")},
    )
    assert upload.status_code == 201
    return upload.json()["id"]


def test_toggle_off_ignores_z_report(client, db_session, setup) -> None:
    """No setting: a passed Z report is ignored — posts gross card sale only."""
    entity_id = setup["entity_id"]
    summary_id = _upload(client, entity_id)

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "z_report_kurus": SYSTEM_CARD_KURUS + 10_000,
        },
    )
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "posted"
    assert confirm.json()["z_report_kurus"] is None

    with entity_context(db_session, entity_id):
        tip_count = db_session.scalar(
            select(func.count())
            .select_from(JournalEntry)
            .where(JournalEntry.source == JournalEntrySource.POS_CARD_TIP)
        )
    assert tip_count == 0
    assert _gl_balance(db_session, entity_id, setup["accounts"][CARD_SALES_CLEARING_CODE]) == (
        SYSTEM_CARD_KURUS
    )


def test_z_enabled_missing_z_needs_review(client, db_session, setup) -> None:
    _enable_z_report(db_session, entity_id := setup["entity_id"])
    summary_id = _upload(client, entity_id)

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
        },
    )
    assert confirm.status_code == 200
    body = confirm.json()
    assert body["status"] == "needs_review"
    assert "Z report required" in body["review_reason"]


def test_z_mismatch_needs_review(client, db_session, setup) -> None:
    """Z above system card (would have been a 'tip' under B1) → review, no auto-post."""
    _enable_z_report(db_session, entity_id := setup["entity_id"])
    summary_id = _upload(client, entity_id)

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "z_report_kurus": SYSTEM_CARD_KURUS + 10_000,
        },
    )
    assert confirm.status_code == 200
    body = confirm.json()
    assert body["status"] == "needs_review"
    assert body["review_reason"] == _z_mismatch_review_reason(
        Z_ABOVE_CARD, SYSTEM_CARD_KURUS
    )
    assert "expense paper" in body["review_reason"]
    assert body["z_report_kurus"] == Z_ABOVE_CARD

    with entity_context(db_session, entity_id):
        tip_count = db_session.scalar(
            select(func.count())
            .select_from(JournalEntry)
            .where(JournalEntry.source == JournalEntrySource.POS_CARD_TIP)
        )
    assert tip_count == 0


def test_z_match_posts_gross_card_no_tip_leg(client, db_session, setup) -> None:
    _enable_z_report(db_session, entity_id := setup["entity_id"])
    clearing_id = setup["accounts"][CARD_SALES_CLEARING_CODE]
    revenue_id = setup["accounts"][SALES_REVENUE_CODE]
    summary_id = _upload(client, entity_id)

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "z_report_kurus": SYSTEM_CARD_KURUS,
        },
    )
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "posted"
    assert confirm.json()["z_report_kurus"] == SYSTEM_CARD_KURUS

    revenue_credit = -_gl_balance(db_session, entity_id, revenue_id)
    assert revenue_credit == 500_000
    assert _gl_balance(db_session, entity_id, clearing_id) == SYSTEM_CARD_KURUS
    assert _gl_balance(db_session, entity_id, setup["accounts"][GENERAL_EXPENSE_CODE]) == 0

    with entity_context(db_session, entity_id):
        tip_count = db_session.scalar(
            select(func.count())
            .select_from(JournalEntry)
            .where(JournalEntry.source == JournalEntrySource.POS_CARD_TIP)
        )
    assert tip_count == 0


def test_z_below_card_needs_review(client, db_session, setup) -> None:
    _enable_z_report(db_session, entity_id := setup["entity_id"])
    summary_id = _upload(client, entity_id)

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "z_report_kurus": SYSTEM_CARD_KURUS - 10_000,
        },
    )
    assert confirm.status_code == 200
    body = confirm.json()
    assert body["status"] == "needs_review"
    assert body["review_reason"] == _z_mismatch_review_reason(
        SYSTEM_CARD_KURUS - 10_000, SYSTEM_CARD_KURUS
    )


def test_deposit_plus_commission_clears_1400_to_zero(client, db_session, setup) -> None:
    """After a matched Z post, bank deposit (net) + commission sweep zeros clearing."""
    _enable_z_report(db_session, entity_id := setup["entity_id"])
    clearing_id = setup["accounts"][CARD_SALES_CLEARING_CODE]
    summary_id = _upload(client, entity_id)

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "z_report_kurus": SYSTEM_CARD_KURUS,
        },
    )
    assert confirm.status_code == 200
    assert _gl_balance(db_session, entity_id, clearing_id) == SYSTEM_CARD_KURUS

    pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=setup["bank"].id,
        settlement_date=date(2026, 6, 24),
        amount_kurus=SYSTEM_CARD_KURUS - 3_000,
        description="Card deposit",
        actor_id=ACTOR_ID,
        commission_kurus=3_000,
    )
    assert _gl_balance(db_session, entity_id, clearing_id) == 0


def test_review_corrected_to_match_then_posts(client, db_session, setup) -> None:
    """Owner fixes card to match Z in review, then confirm succeeds."""
    _enable_z_report(db_session, entity_id := setup["entity_id"])
    summary_id = _upload(client, entity_id)

    first = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "z_report_kurus": SYSTEM_CARD_KURUS + 10_000,
        },
    )
    assert first.json()["status"] == "needs_review"

    second = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "cash_kurus": 140_000,
            "card_kurus": SYSTEM_CARD_KURUS + 10_000,
            "z_report_kurus": SYSTEM_CARD_KURUS + 10_000,
        },
    )
    assert second.status_code == 200
    assert second.json()["status"] == "posted"
    assert second.json()["confirmed_card_kurus"] == Z_ABOVE_CARD


def test_z_mismatch_tip_expense_reconfirm_deposit_clears_1400(
    client, db_session, setup
) -> None:
    """Mismatch → expense tip → cash/card reallocation → deposit + sweep zeros clearing."""
    _enable_z_report(db_session, entity_id := setup["entity_id"])
    clearing_id = setup["accounts"][CARD_SALES_CLEARING_CODE]
    tips_id = setup["accounts"][GENERAL_EXPENSE_CODE]
    summary_id = _upload(client, entity_id)

    first = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "z_report_kurus": Z_ABOVE_CARD,
        },
    )
    assert first.json()["status"] == "needs_review"

    tip_expense = client.post(
        f"/entities/{entity_id}/expenses",
        json={
            "expense_date": "2026-06-22",
            "amount_kurus": TIP_KURUS,
            "expense_account_id": str(tips_id),
            "money_account_id": str(setup["drawer"].id),
            "written_item_description": "Bahşiş",
            "has_source_document": False,
            "description": "Card tip paid to staff",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert tip_expense.status_code == 201
    assert tip_expense.json()["status"] == "posted"

    second = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "cash_kurus": 150_000 - TIP_KURUS,
            "card_kurus": Z_ABOVE_CARD,
            "z_report_kurus": Z_ABOVE_CARD,
        },
    )
    assert second.status_code == 200
    assert second.json()["status"] == "posted"
    assert _gl_balance(db_session, entity_id, clearing_id) == Z_ABOVE_CARD
    assert _gl_balance(db_session, entity_id, tips_id) == TIP_KURUS

    pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=setup["bank"].id,
        settlement_date=date(2026, 6, 24),
        amount_kurus=Z_ABOVE_CARD - 3_000,
        description="Card deposit",
        actor_id=ACTOR_ID,
        commission_kurus=3_000,
    )
    assert _gl_balance(db_session, entity_id, clearing_id) == 0
