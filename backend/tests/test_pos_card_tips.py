"""POS card tips via card-terminal Z report (Slice B1).

Z report total = system card sale + card tips. The card tip for a day is derived
as ``z_report_kurus - card`` and booked per the entity ``card_sale_basis``:

- system   — tip is a pass-through (Dr 1400 / Cr cash drawer); revenue = card.
- z_report  — tip is an expense (Dr 5700 / Cr cash drawer); revenue = Z total.

In both cases the card clearing (1400) is debited the full Z total so that bank
deposits + the commission sweep clear it to zero.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    CARD_SALES_CLEARING_CODE,
    SALES_REVENUE_CODE,
    TIPS_EXPENSE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.core.pos import posting as pos_posting
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.entities import service as entity_service
from app.features.entities.schema import EntitySettingCreate
from app.features.pos.settings import (
    CARD_SALE_BASIS_KEY,
    CARD_TIPS_Z_REPORT_ENABLED_KEY,
)

FIXTURES = __import__("pathlib").Path(__file__).resolve().parent / "fixtures" / "pos"
SAMPLE_SUMMARY = FIXTURES / "sample_summary.txt"

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _enable_z_report(db_session, entity_id, basis: str | None) -> None:
    entity_service.create_entity_setting(
        db_session,
        entity_id,
        EntitySettingCreate(key=CARD_TIPS_Z_REPORT_ENABLED_KEY, value="true"),
    )
    if basis is not None:
        entity_service.create_entity_setting(
            db_session,
            entity_id,
            EntitySettingCreate(key=CARD_SALE_BASIS_KEY, value=basis),
        )


@pytest.fixture
def setup(db_session, restaurant_a):
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
    """No setting: a passed Z report is ignored — posts gross card sale, no tip leg."""
    entity_id = setup["entity_id"]
    summary_id = _upload(client, entity_id)

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "z_report_kurus": 360_000,
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
    # 1400 = card only (no tip), revenue = card.
    assert _gl_balance(db_session, entity_id, setup["accounts"][CARD_SALES_CLEARING_CODE]) == 350_000


def test_ask_basis_routes_to_needs_review(client, db_session, setup) -> None:
    _enable_z_report(db_session, entity_id := setup["entity_id"], basis="ask")
    summary_id = _upload(client, entity_id)

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "z_report_kurus": 360_000,
        },
    )
    assert confirm.status_code == 200
    body = confirm.json()
    assert body["status"] == "needs_review"
    assert "choose" in body["review_reason"]
    assert body["z_report_kurus"] == 360_000


def test_system_basis_tip_is_pass_through(client, db_session, setup) -> None:
    _enable_z_report(db_session, entity_id := setup["entity_id"], basis="system")
    clearing_id = setup["accounts"][CARD_SALES_CLEARING_CODE]
    revenue_id = setup["accounts"][SALES_REVENUE_CODE]
    drawer_gl = setup["drawer"].gl_account_id
    summary_id = _upload(client, entity_id)

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "z_report_kurus": 360_000,
        },
    )
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "posted"
    assert confirm.json()["z_report_kurus"] == 360_000

    # Revenue = system card (350k) + cash (150k); tip not in revenue.
    revenue_credit = -_gl_balance(db_session, entity_id, revenue_id)
    assert revenue_credit == 500_000
    # 1400 debited the full Z (card 350k + tip 10k).
    assert _gl_balance(db_session, entity_id, clearing_id) == 360_000
    # Tip leg: Dr 1400 / Cr drawer; no tips-expense.
    with entity_context(db_session, entity_id):
        tip_je = db_session.scalar(
            select(JournalEntry).where(
                JournalEntry.source == JournalEntrySource.POS_CARD_TIP
            )
        )
        assert tip_je is not None
        lines = {l.account_id: l for l in tip_je.lines}
    assert lines[clearing_id].side == AccountNormalBalance.DEBIT
    assert lines[clearing_id].amount_kurus == 10_000
    assert lines[drawer_gl].side == AccountNormalBalance.CREDIT
    assert lines[drawer_gl].amount_kurus == 10_000
    assert _gl_balance(db_session, entity_id, setup["accounts"][TIPS_EXPENSE_CODE]) == 0


def test_z_basis_tip_is_expense(client, db_session, setup) -> None:
    _enable_z_report(db_session, entity_id := setup["entity_id"], basis="z_report")
    clearing_id = setup["accounts"][CARD_SALES_CLEARING_CODE]
    revenue_id = setup["accounts"][SALES_REVENUE_CODE]
    tips_id = setup["accounts"][TIPS_EXPENSE_CODE]
    drawer_gl = setup["drawer"].gl_account_id
    summary_id = _upload(client, entity_id)

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "z_report_kurus": 360_000,
        },
    )
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "posted"

    # Revenue = Z card (360k) + cash (150k); tip included in revenue.
    revenue_credit = -_gl_balance(db_session, entity_id, revenue_id)
    assert revenue_credit == 510_000
    # 1400 debited the full Z.
    assert _gl_balance(db_session, entity_id, clearing_id) == 360_000
    # Tip expense 5700 = tip; drawer credited tip.
    assert _gl_balance(db_session, entity_id, tips_id) == 10_000
    with entity_context(db_session, entity_id):
        tip_je = db_session.scalar(
            select(JournalEntry).where(
                JournalEntry.source == JournalEntrySource.POS_CARD_TIP
            )
        )
        lines = {l.account_id: l for l in tip_je.lines}
    assert lines[tips_id].side == AccountNormalBalance.DEBIT
    assert lines[drawer_gl].side == AccountNormalBalance.CREDIT
    assert lines[drawer_gl].amount_kurus == 10_000


@pytest.mark.parametrize("basis", ["system", "z_report"])
def test_deposit_plus_commission_clears_1400_to_zero(client, db_session, setup, basis) -> None:
    """Full clearance: after the Z deposit (net) + commission, 1400 returns to 0."""
    _enable_z_report(db_session, entity_id := setup["entity_id"], basis=basis)
    clearing_id = setup["accounts"][CARD_SALES_CLEARING_CODE]
    summary_id = _upload(client, entity_id)

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "z_report_kurus": 360_000,
        },
    )
    assert confirm.status_code == 200
    assert _gl_balance(db_session, entity_id, clearing_id) == 360_000

    # Bank deposits Z minus a hidden 3,000 commission.
    pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=setup["bank"].id,
        settlement_date=date(2026, 6, 24),
        amount_kurus=357_000,
        description="Z deposit",
        actor_id=ACTOR_ID,
        commission_kurus=3_000,
    )
    assert _gl_balance(db_session, entity_id, clearing_id) == 0


def test_negative_tip_needs_review(client, db_session, setup) -> None:
    _enable_z_report(db_session, entity_id := setup["entity_id"], basis="z_report")
    summary_id = _upload(client, entity_id)

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "z_report_kurus": 340_000,
        },
    )
    assert confirm.status_code == 200
    body = confirm.json()
    assert body["status"] == "needs_review"
    assert "below" in body["review_reason"]


def test_expected_tip_mismatch_needs_review(client, db_session, setup) -> None:
    _enable_z_report(db_session, entity_id := setup["entity_id"], basis="z_report")
    summary_id = _upload(client, entity_id)

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "z_report_kurus": 360_000,
            "expected_tip_kurus": 7_000,
        },
    )
    assert confirm.status_code == 200
    body = confirm.json()
    assert body["status"] == "needs_review"
    assert "mismatch" in body["review_reason"]


def test_per_entry_override_resolves_ask(client, db_session, setup) -> None:
    """Entity default is ask; a per-entry basis override lets the day post."""
    _enable_z_report(db_session, entity_id := setup["entity_id"], basis="ask")
    summary_id = _upload(client, entity_id)

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
            "z_report_kurus": 360_000,
            "card_sale_basis": "z_report",
        },
    )
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "posted"
    assert _gl_balance(db_session, entity_id, setup["accounts"][TIPS_EXPENSE_CODE]) == 10_000
