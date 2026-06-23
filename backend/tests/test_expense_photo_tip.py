"""Expense-photo OCR → 5700 cash-tip draft in Needs Review, then post (Slice C).

Owner ask (2026-06-23): "when I upload an expense picture and the OCR reads a tip
from there, it must record that tip as an expense from cash." A tip is a cash
expense (``Dr 5700 Tips Expense / Cr cash``), and — review-first — nothing posts
until the owner confirms the read.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.adapters.ocr_ai.expense_photo import register_expense_photo_fixture
from app.core.chart_of_accounts.default_chart import TIPS_EXPENSE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.expenses import service as expenses_service
from app.features.expenses.models import ExpenseEntryStatus
from app.features.expenses.schema import ConfirmTipPhotoRequest, ExpenseCreate

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _setup(db_session, entity):
    seed_default_chart(db_session, entity.id)
    drawer = banking_service.create_money_account(
        db_session,
        entity.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, entity.id):
        accounts = {a.code: a for a in db_session.scalars(select(Account))}
    return drawer, accounts


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


_PHOTO_WITH_TIP = b"FATURA\nTarih: 23.06.2026\nTutar: 250,00\nBahsis: 50,00\n"
_PHOTO_NO_TIP = b"FATURA\nTarih: 23.06.2026\nTutar: 250,00\nKDV: 25,00\n"
_BINARY_PHOTO = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01"


def test_photo_with_tip_creates_5700_needs_review_draft(db_session, restaurant_a) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    tips_id = accounts[TIPS_EXPENSE_CODE].id

    read = expenses_service.create_tip_expense_from_photo(
        db_session,
        restaurant_a.id,
        _PHOTO_WITH_TIP,
        money_account_id=drawer.id,
        actor_id=ACTOR_ID,
        filename="tip.txt",
        content_type="text/plain",
    )

    assert read.status == ExpenseEntryStatus.NEEDS_REVIEW
    assert read.amount_kurus == 5_000
    assert read.expense_account_id == tips_id
    assert read.has_source_document is True
    assert read.source_document_fingerprint is not None
    assert read.source_document_path is not None
    assert read.journal_entry_id is None  # review-first: nothing posted yet
    assert read.expense_date == date(2026, 6, 23)


def test_confirm_photo_tip_posts_dr_5700_cr_cash(db_session, restaurant_a) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    tips_id = accounts[TIPS_EXPENSE_CODE].id
    drawer_gl_id = drawer.gl_account_id

    draft = expenses_service.create_tip_expense_from_photo(
        db_session,
        restaurant_a.id,
        _PHOTO_WITH_TIP,
        money_account_id=drawer.id,
        actor_id=ACTOR_ID,
    )

    posted = expenses_service.confirm_tip_expense(
        db_session,
        restaurant_a.id,
        draft.id,
        ConfirmTipPhotoRequest(actor_id=ACTOR_ID),
    )

    assert posted.status == ExpenseEntryStatus.POSTED
    assert posted.journal_entry_id is not None
    assert posted.source_document_fingerprint == draft.source_document_fingerprint

    with entity_context(db_session, restaurant_a.id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == posted.journal_entry_id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}
        journal = db_session.get(JournalEntry, posted.journal_entry_id)
        assert journal.source == JournalEntrySource.EXPENSE_ENTRY

    assert by_account[tips_id].side == AccountNormalBalance.DEBIT
    assert by_account[tips_id].amount_kurus == 5_000
    assert by_account[drawer_gl_id].side == AccountNormalBalance.CREDIT
    assert by_account[drawer_gl_id].amount_kurus == 5_000

    assert _gl_balance(db_session, restaurant_a.id, tips_id, AccountNormalBalance.DEBIT) == 5_000
    assert (
        _gl_balance(db_session, restaurant_a.id, drawer_gl_id, AccountNormalBalance.DEBIT)
        == -5_000
    )


def test_confirm_can_correct_the_read_amount(db_session, restaurant_a) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    tips_id = accounts[TIPS_EXPENSE_CODE].id

    draft = expenses_service.create_tip_expense_from_photo(
        db_session,
        restaurant_a.id,
        _PHOTO_WITH_TIP,
        money_account_id=drawer.id,
        actor_id=ACTOR_ID,
    )

    posted = expenses_service.confirm_tip_expense(
        db_session,
        restaurant_a.id,
        draft.id,
        ConfirmTipPhotoRequest(actor_id=ACTOR_ID, amount_kurus=7_500),
    )

    assert posted.amount_kurus == 7_500
    assert _gl_balance(db_session, restaurant_a.id, tips_id, AccountNormalBalance.DEBIT) == 7_500


def test_confirm_twice_does_not_double_post(db_session, restaurant_a) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    tips_id = accounts[TIPS_EXPENSE_CODE].id

    draft = expenses_service.create_tip_expense_from_photo(
        db_session,
        restaurant_a.id,
        _PHOTO_WITH_TIP,
        money_account_id=drawer.id,
        actor_id=ACTOR_ID,
    )
    expenses_service.confirm_tip_expense(
        db_session, restaurant_a.id, draft.id, ConfirmTipPhotoRequest(actor_id=ACTOR_ID)
    )

    with pytest.raises(expenses_service.ExpenseNotReviewableError):
        expenses_service.confirm_tip_expense(
            db_session, restaurant_a.id, draft.id, ConfirmTipPhotoRequest(actor_id=ACTOR_ID)
        )

    assert _gl_balance(db_session, restaurant_a.id, tips_id, AccountNormalBalance.DEBIT) == 5_000


def test_duplicate_photo_rejected(db_session, restaurant_a) -> None:
    drawer, _ = _setup(db_session, restaurant_a)

    first = expenses_service.create_tip_expense_from_photo(
        db_session,
        restaurant_a.id,
        _PHOTO_WITH_TIP,
        money_account_id=drawer.id,
        actor_id=ACTOR_ID,
    )

    with pytest.raises(expenses_service.DuplicateExpenseDocumentError) as exc:
        expenses_service.create_tip_expense_from_photo(
            db_session,
            restaurant_a.id,
            _PHOTO_WITH_TIP,
            money_account_id=drawer.id,
            actor_id=ACTOR_ID,
        )
    assert exc.value.existing.id == first.id


def test_same_photo_different_entities_both_succeed(
    db_session, restaurant_a, restaurant_b
) -> None:
    drawer_a, _ = _setup(db_session, restaurant_a)
    drawer_b, _ = _setup(db_session, restaurant_b)

    read_a = expenses_service.create_tip_expense_from_photo(
        db_session,
        restaurant_a.id,
        _PHOTO_WITH_TIP,
        money_account_id=drawer_a.id,
        actor_id=ACTOR_ID,
    )
    read_b = expenses_service.create_tip_expense_from_photo(
        db_session,
        restaurant_b.id,
        _PHOTO_WITH_TIP,
        money_account_id=drawer_b.id,
        actor_id=ACTOR_ID,
    )

    assert read_a.entity_id == restaurant_a.id
    assert read_b.entity_id == restaurant_b.id
    assert read_a.source_document_fingerprint == read_b.source_document_fingerprint


def test_no_tip_detected_routes_to_zero_draft(db_session, restaurant_a) -> None:
    drawer, _ = _setup(db_session, restaurant_a)

    draft = expenses_service.create_tip_expense_from_photo(
        db_session,
        restaurant_a.id,
        _PHOTO_NO_TIP,
        money_account_id=drawer.id,
        actor_id=ACTOR_ID,
    )

    assert draft.status == ExpenseEntryStatus.NEEDS_REVIEW
    assert draft.amount_kurus == 0
    assert draft.review_reason is not None and "No tip detected" in draft.review_reason

    # Confirming without an amount is refused — a zero tip must not post.
    with pytest.raises(expenses_service.ExpenseNotReviewableError):
        expenses_service.confirm_tip_expense(
            db_session,
            restaurant_a.id,
            draft.id,
            ConfirmTipPhotoRequest(actor_id=ACTOR_ID),
        )

    posted = expenses_service.confirm_tip_expense(
        db_session,
        restaurant_a.id,
        draft.id,
        ConfirmTipPhotoRequest(actor_id=ACTOR_ID, amount_kurus=3_000),
    )
    assert posted.status == ExpenseEntryStatus.POSTED
    assert posted.amount_kurus == 3_000


def test_binary_photo_unsupported(db_session, restaurant_a) -> None:
    drawer, _ = _setup(db_session, restaurant_a)

    with pytest.raises(expenses_service.ExpensePhotoUnsupportedError):
        expenses_service.create_tip_expense_from_photo(
            db_session,
            restaurant_a.id,
            _BINARY_PHOTO,
            money_account_id=drawer.id,
            actor_id=ACTOR_ID,
        )


def test_registered_fixture_image_extracts_tip(db_session, restaurant_a) -> None:
    drawer, _ = _setup(db_session, restaurant_a)
    image = b"\x89PNG\r\n\x1a\nMIZAN-TIP-FIXTURE-001"
    register_expense_photo_fixture(
        image, {"tip_kurus": 12_000, "expense_date": date(2026, 6, 20)}
    )

    draft = expenses_service.create_tip_expense_from_photo(
        db_session,
        restaurant_a.id,
        image,
        money_account_id=drawer.id,
        actor_id=ACTOR_ID,
        filename="tip.png",
        content_type="image/png",
    )

    assert draft.amount_kurus == 12_000
    assert draft.expense_date == date(2026, 6, 20)


def test_confirm_rejects_non_photo_expense(db_session, restaurant_a) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    rent_id = accounts["5000"].id

    manual = expenses_service.create_expense(
        db_session,
        restaurant_a.id,
        ExpenseCreate(
            expense_date=date(2026, 6, 23),
            amount_kurus=10_000,
            expense_account_id=rent_id,
            money_account_id=drawer.id,
            written_item_description="kira",
            description="Rent",
            actor_id=ACTOR_ID,
        ),
    )

    with pytest.raises(expenses_service.NotATipPhotoError):
        expenses_service.confirm_tip_expense(
            db_session,
            restaurant_a.id,
            manual.id,
            ConfirmTipPhotoRequest(actor_id=ACTOR_ID),
        )


def test_upload_and_confirm_via_api(client, db_session, restaurant_a) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    tips_id = accounts[TIPS_EXPENSE_CODE].id
    entity_id = restaurant_a.id

    upload = client.post(
        f"/entities/{entity_id}/expenses/tip-photos",
        files={"file": ("tip.txt", _PHOTO_WITH_TIP, "text/plain")},
        data={"money_account_id": str(drawer.id), "actor_id": str(ACTOR_ID)},
    )
    assert upload.status_code == 201, upload.text
    body = upload.json()
    assert body["status"] == "needs_review"
    assert body["amount_kurus"] == 5_000
    expense_id = body["id"]

    confirm = client.post(
        f"/entities/{entity_id}/expenses/tip-photos/{expense_id}/confirm",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert confirm.status_code == 200, confirm.text
    assert confirm.json()["status"] == "posted"

    # Duplicate re-upload is rejected.
    dup = client.post(
        f"/entities/{entity_id}/expenses/tip-photos",
        files={"file": ("tip.txt", _PHOTO_WITH_TIP, "text/plain")},
        data={"money_account_id": str(drawer.id), "actor_id": str(ACTOR_ID)},
    )
    assert dup.status_code == 409, dup.text

    assert _gl_balance(db_session, entity_id, tips_id, AccountNormalBalance.DEBIT) == 5_000
