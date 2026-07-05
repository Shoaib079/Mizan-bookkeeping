"""POS daily-summary photo intake — upload, math check, confirm posting (Decisions §9)."""

from __future__ import annotations

import hashlib
import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.adapters.ocr_ai.pos_summary import extract_pos_summary, math_valid
from app.core.chart_of_accounts.default_chart import (
    CARD_SALES_CLEARING_CODE,
    SALES_REVENUE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.pos.daily_summary_service import (
    PosDailySummaryConfirmError,
    confirm_pos_daily_summary_intake,
)
from app.features.pos.models import CardSalesBatch, PosDailySummary, PosDailySummaryStatus
from app.features.pos.schema import ConfirmPosDailySummaryRequest

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "pos"
SAMPLE_SUMMARY = FIXTURES / "sample_summary.txt"
MISMATCH_SUMMARY = FIXTURES / "mismatch_summary.txt"
DUPLICATE_DAY_SUMMARY = FIXTURES / "duplicate_day_summary.txt"

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _cash_account(db_session, entity_id):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )


@pytest.fixture
def pos_summary_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = _cash_account(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "accounts": accounts,
    }


def test_extract_sample_fixture_fields() -> None:
    content = SAMPLE_SUMMARY.read_bytes()
    extraction = extract_pos_summary(content)

    assert extraction.summary_date == date(2026, 6, 22)
    assert extraction.cash_kurus == 150_000
    assert extraction.card_kurus == 350_000
    assert extraction.total_kurus == 500_000
    assert math_valid(extraction.cash_kurus, extraction.card_kurus, extraction.total_kurus)


def test_upload_creates_draft_with_extracted_amounts(client, restaurant_a, pos_summary_setup) -> None:
    content = SAMPLE_SUMMARY.read_bytes()
    response = client.post(
        f"/entities/{restaurant_a.id}/pos/daily-summaries",
        files={"file": ("summary.txt", content, "text/plain")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["cash_kurus"] == 150_000
    assert body["card_kurus"] == 350_000
    assert body["total_kurus"] == 500_000
    assert body["file_fingerprint"]
    assert "stored_path" in body["extraction_payload"]


def test_math_mismatch_needs_review_confirm_blocked(client, restaurant_a, pos_summary_setup) -> None:
    content = MISMATCH_SUMMARY.read_bytes()
    upload = client.post(
        f"/entities/{restaurant_a.id}/pos/daily-summaries",
        files={"file": ("bad.txt", content, "text/plain")},
    )
    assert upload.status_code == 201
    summary_id = upload.json()["id"]
    assert upload.json()["status"] == "needs_review"

    drawer_id = pos_summary_setup["drawer"].id
    confirm = client.post(
        f"/entities/{restaurant_a.id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(drawer_id),
            "actor_id": str(ACTOR_ID),
        },
    )
    assert confirm.status_code == 422


def test_valid_confirm_posts_card_batch_and_cash_in(
    db_session, client, pos_summary_setup
) -> None:
    entity_id = pos_summary_setup["entity_id"]
    drawer = pos_summary_setup["drawer"]
    revenue_id = pos_summary_setup["accounts"][SALES_REVENUE_CODE]
    clearing_id = pos_summary_setup["accounts"][CARD_SALES_CLEARING_CODE]

    content = SAMPLE_SUMMARY.read_bytes()
    upload = client.post(
        f"/entities/{entity_id}/pos/daily-summaries",
        files={"file": ("summary.txt", content, "text/plain")},
    )
    summary_id = upload.json()["id"]

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(drawer.id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
        },
    )
    assert confirm.status_code == 200
    body = confirm.json()
    assert body["status"] == "posted"
    assert body["card_sales_batch_id"]
    assert body["cash_movement_id"]
    assert body["confirmed_cash_kurus"] == 150_000
    assert body["confirmed_card_kurus"] == 350_000

    # Sales posted gross — revenue equals cash/card with no tip carve-out.
    cash_revenue = 150_000
    card_revenue = 350_000

    with entity_context(db_session, entity_id):
        batch = db_session.get(CardSalesBatch, uuid.UUID(body["card_sales_batch_id"]))
        assert batch is not None
        assert batch.gross_amount_kurus == 350_000

        card_je = db_session.get(JournalEntry, batch.journal_entry_id)
        assert card_je is not None
        assert card_je.source == JournalEntrySource.CARD_SALES

        card_lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == batch.journal_entry_id
            )
        ).all()
        card_by_account = {line.account_id: line for line in card_lines}
        assert card_by_account[clearing_id].side == AccountNormalBalance.DEBIT
        assert card_by_account[clearing_id].amount_kurus == card_revenue
        assert card_by_account[revenue_id].side == AccountNormalBalance.CREDIT
        assert card_by_account[revenue_id].amount_kurus == card_revenue

        cash_je_id = db_session.scalar(
            select(JournalEntry.id).where(
                JournalEntry.source == JournalEntrySource.CASH_MOVEMENT
            )
        )
        cash_lines = db_session.scalars(
            select(JournalEntryLine).where(JournalEntryLine.journal_entry_id == cash_je_id)
        ).all()
        cash_by_account = {line.account_id: line for line in cash_lines}
        assert cash_by_account[drawer.gl_account_id].amount_kurus == cash_revenue
        assert cash_by_account[revenue_id].amount_kurus == cash_revenue

        revenue_credit = int(
            db_session.scalar(
                select(func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0)).where(
                    JournalEntryLine.account_id == revenue_id,
                    JournalEntryLine.side == AccountNormalBalance.CREDIT,
                )
            )
            or 0
        )
        assert revenue_credit == 500_000

        # No Tips Payable (2260) account exists anymore.
        tips_payable = db_session.scalar(select(Account).where(Account.code == "2260"))
        assert tips_payable is None


def test_duplicate_fingerprint_409(client, restaurant_a, pos_summary_setup) -> None:
    content = SAMPLE_SUMMARY.read_bytes()
    url = f"/entities/{restaurant_a.id}/pos/daily-summaries"

    first = client.post(url, files={"file": ("summary.txt", content, "text/plain")})
    assert first.status_code == 201
    existing_id = first.json()["id"]

    second = client.post(url, files={"file": ("summary.txt", content, "text/plain")})
    assert second.status_code == 409
    assert second.json()["detail"]["existing_summary_id"] == existing_id


def test_cross_entity_isolation(
    client, restaurant_a, restaurant_b, pos_summary_setup
) -> None:
    content = SAMPLE_SUMMARY.read_bytes()
    create = client.post(
        f"/entities/{restaurant_a.id}/pos/daily-summaries",
        files={"file": ("summary.txt", content, "text/plain")},
    )
    summary_id = create.json()["id"]

    list_b = client.get(f"/entities/{restaurant_b.id}/pos/daily-summaries")
    assert list_b.status_code == 200
    assert list_b.json()["total"] == 0

    get_b = client.get(f"/entities/{restaurant_b.id}/pos/daily-summaries/{summary_id}")
    assert get_b.status_code == 404


def test_needs_review_corrected_confirm_posts(
    client, pos_summary_setup
) -> None:
    entity_id = pos_summary_setup["entity_id"]
    drawer = pos_summary_setup["drawer"]
    content = MISMATCH_SUMMARY.read_bytes()

    upload = client.post(
        f"/entities/{entity_id}/pos/daily-summaries",
        files={"file": ("bad.txt", content, "text/plain")},
    )
    summary_id = upload.json()["id"]

    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(drawer.id),
            "actor_id": str(ACTOR_ID),
            "cash_kurus": 200_000,
            "card_kurus": 200_000,
        },
    )
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "posted"
    assert confirm.json()["total_kurus"] == 400_000


def test_list_and_get_summary(client, restaurant_a, pos_summary_setup) -> None:
    content = SAMPLE_SUMMARY.read_bytes()
    create = client.post(
        f"/entities/{restaurant_a.id}/pos/daily-summaries",
        files={"file": ("summary.txt", content, "text/plain")},
    )
    summary_id = create.json()["id"]

    listing = client.get(f"/entities/{restaurant_a.id}/pos/daily-summaries")
    assert listing.status_code == 200
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["id"] == summary_id

    single = client.get(f"/entities/{restaurant_a.id}/pos/daily-summaries/{summary_id}")
    assert single.status_code == 200
    assert single.json()["cash_kurus"] == 150_000


def test_duplicate_day_upload_needs_review(client, restaurant_a, pos_summary_setup) -> None:
    first = client.post(
        f"/entities/{restaurant_a.id}/pos/daily-summaries",
        files={"file": ("summary.txt", SAMPLE_SUMMARY.read_bytes(), "text/plain")},
    )
    assert first.status_code == 201
    assert first.json()["status"] == "draft"

    second = client.post(
        f"/entities/{restaurant_a.id}/pos/daily-summaries",
        files={
            "file": (
                "duplicate_day.txt",
                DUPLICATE_DAY_SUMMARY.read_bytes(),
                "text/plain",
            )
        },
    )
    assert second.status_code == 201
    body = second.json()
    assert body["status"] == "needs_review"
    assert "22.06" in body["review_reason"]
    assert "already exists" in body["review_reason"]


def test_confirm_posting_rejected_when_date_already_posted(
    db_session, client, pos_summary_setup
) -> None:
    """Confirm/post guard — rejects a draft for a day that already has a posted summary."""
    entity_id = pos_summary_setup["entity_id"]
    drawer = pos_summary_setup["drawer"]
    sales_date = date(2026, 6, 22)

    first_upload = client.post(
        f"/entities/{entity_id}/pos/daily-summaries",
        files={"file": ("summary.txt", SAMPLE_SUMMARY.read_bytes(), "text/plain")},
    )
    first_id = first_upload.json()["id"]
    confirm_first = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{first_id}/confirm",
        json={
            "money_account_id": str(drawer.id),
            "actor_id": str(ACTOR_ID),
        },
    )
    assert confirm_first.status_code == 200
    assert confirm_first.json()["status"] == "posted"

    rogue_fp = hashlib.sha256(b"rogue-draft-second-summary").hexdigest()
    with entity_context(db_session, entity_id):
        rogue = PosDailySummary(
            entity_id=entity_id,
            status=PosDailySummaryStatus.DRAFT.value,
            file_fingerprint=rogue_fp,
            summary_date=sales_date,
            cash_kurus=100_000,
            card_kurus=100_000,
            total_kurus=200_000,
            extraction_payload={"source": "test"},
        )
        db_session.add(rogue)
        db_session.commit()
        db_session.refresh(rogue)
        rogue_id = rogue.id

    with pytest.raises(PosDailySummaryConfirmError, match="22.06") as exc_info:
        confirm_pos_daily_summary_intake(
            db_session,
            entity_id,
            rogue_id,
            ConfirmPosDailySummaryRequest(
                money_account_id=drawer.id,
                actor_id=ACTOR_ID,
            ),
        )
    assert "already exists" in str(exc_info.value)

    with entity_context(db_session, entity_id):
        posted_count = db_session.scalar(
            select(func.count())
            .select_from(PosDailySummary)
            .where(PosDailySummary.status == PosDailySummaryStatus.POSTED.value)
        )
    assert posted_count == 1


def test_db_partial_unique_index_blocks_second_posted(
    db_session, client, pos_summary_setup
) -> None:
    """DB partial unique index — concurrent/race path cannot leave two posted rows."""
    entity_id = pos_summary_setup["entity_id"]
    drawer = pos_summary_setup["drawer"]
    sales_date = date(2026, 6, 22)

    first_upload = client.post(
        f"/entities/{entity_id}/pos/daily-summaries",
        files={"file": ("summary.txt", SAMPLE_SUMMARY.read_bytes(), "text/plain")},
    )
    first_id = first_upload.json()["id"]
    confirm_first = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{first_id}/confirm",
        json={
            "money_account_id": str(drawer.id),
            "actor_id": str(ACTOR_ID),
        },
    )
    assert confirm_first.status_code == 200

    rogue_fp = hashlib.sha256(b"rogue-for-db-unique-index").hexdigest()
    with entity_context(db_session, entity_id):
        rogue = PosDailySummary(
            entity_id=entity_id,
            status=PosDailySummaryStatus.DRAFT.value,
            file_fingerprint=rogue_fp,
            summary_date=sales_date,
            cash_kurus=50_000,
            card_kurus=50_000,
            total_kurus=100_000,
            extraction_payload={"source": "test"},
        )
        db_session.add(rogue)
        db_session.commit()
        db_session.refresh(rogue)
        rogue_id = rogue.id

    with entity_context(db_session, entity_id):
        rogue = db_session.get(PosDailySummary, rogue_id)
        assert rogue is not None
        rogue.status = PosDailySummaryStatus.POSTED.value
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()


def test_second_summary_same_date_cannot_double_post(
    db_session, client, pos_summary_setup
) -> None:
    entity_id = pos_summary_setup["entity_id"]
    drawer = pos_summary_setup["drawer"]
    revenue_id = pos_summary_setup["accounts"][SALES_REVENUE_CODE]

    first_upload = client.post(
        f"/entities/{entity_id}/pos/daily-summaries",
        files={"file": ("summary.txt", SAMPLE_SUMMARY.read_bytes(), "text/plain")},
    )
    first_id = first_upload.json()["id"]

    confirm_first = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{first_id}/confirm",
        json={
            "money_account_id": str(drawer.id),
            "actor_id": str(ACTOR_ID),
        },
    )
    assert confirm_first.status_code == 200
    assert confirm_first.json()["status"] == "posted"

    second_upload = client.post(
        f"/entities/{entity_id}/pos/daily-summaries",
        files={
            "file": (
                "duplicate_day.txt",
                DUPLICATE_DAY_SUMMARY.read_bytes(),
                "text/plain",
            )
        },
    )
    assert second_upload.status_code == 201
    assert second_upload.json()["status"] == "needs_review"
    second_id = second_upload.json()["id"]

    confirm_second = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{second_id}/confirm",
        json={
            "money_account_id": str(drawer.id),
            "actor_id": str(ACTOR_ID),
        },
    )
    assert confirm_second.status_code == 422
    assert "22.06" in confirm_second.json()["detail"]
    assert "already exists" in confirm_second.json()["detail"]

    with entity_context(db_session, entity_id):
        revenue_credit = int(
            db_session.scalar(
                select(func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0)).where(
                    JournalEntryLine.account_id == revenue_id,
                    JournalEntryLine.side == AccountNormalBalance.CREDIT,
                )
            )
            or 0
        )
        posted_count = db_session.scalar(
            select(func.count())
            .select_from(PosDailySummary)
            .where(PosDailySummary.status == PosDailySummaryStatus.POSTED.value)
        )
    assert revenue_credit == 500_000
    assert posted_count == 1


def test_reject_summary(client, restaurant_a, pos_summary_setup) -> None:
    content = SAMPLE_SUMMARY.read_bytes()
    create = client.post(
        f"/entities/{restaurant_a.id}/pos/daily-summaries",
        files={"file": ("summary.txt", content, "text/plain")},
    )
    summary_id = create.json()["id"]

    reject = client.post(
        f"/entities/{restaurant_a.id}/pos/daily-summaries/{summary_id}/reject",
        json={"reason": "Wrong day"},
    )
    assert reject.status_code == 204

    confirm = client.post(
        f"/entities/{restaurant_a.id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(pos_summary_setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
        },
    )
    assert confirm.status_code == 404


def test_list_daily_summaries_by_date_and_review_filter(
    client, restaurant_a, pos_summary_setup
) -> None:
    content = SAMPLE_SUMMARY.read_bytes()
    create = client.post(
        f"/entities/{restaurant_a.id}/pos/daily-summaries",
        files={"file": ("summary.txt", content, "text/plain")},
    )
    assert create.status_code == 201
    summary_date = create.json()["summary_date"]

    in_range = client.get(
        f"/entities/{restaurant_a.id}/pos/daily-summaries",
        params={"from": summary_date, "to": summary_date, "review": "pending"},
    )
    assert in_range.status_code == 200
    assert in_range.json()["total"] == 1

    posted = client.get(
        f"/entities/{restaurant_a.id}/pos/daily-summaries",
        params={"from": summary_date, "to": summary_date, "review": "posted"},
    )
    assert posted.status_code == 200
    assert posted.json()["total"] == 0

    outside = client.get(
        f"/entities/{restaurant_a.id}/pos/daily-summaries",
        params={"from": "2020-01-01", "to": "2020-01-31"},
    )
    assert outside.status_code == 200
    assert outside.json()["total"] == 0


def test_export_daily_summaries_xlsx(client, restaurant_a, pos_summary_setup) -> None:
    content = SAMPLE_SUMMARY.read_bytes()
    create = client.post(
        f"/entities/{restaurant_a.id}/pos/daily-summaries",
        files={"file": ("summary.txt", content, "text/plain")},
    )
    assert create.status_code == 201
    summary_date = create.json()["summary_date"]

    export_resp = client.get(
        f"/entities/{restaurant_a.id}/pos/daily-summaries/export",
        params={"from": summary_date, "to": summary_date, "review": "pending"},
    )
    assert export_resp.status_code == 200
    assert (
        export_resp.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert "attachment" in export_resp.headers.get("content-disposition", "")
    assert len(export_resp.content) > 500
