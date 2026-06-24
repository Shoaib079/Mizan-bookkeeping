"""Expense receipt OCR — multi-line intake, confirm posts N cash expenses (Phase 8.7)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.adapters.ocr_ai.expense_receipt import register_expense_receipt_fixture
from app.core.chart_of_accounts.default_chart import GENERAL_EXPENSE_CODE, TIPS_EXPENSE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntryLine
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.expenses import receipt_service
from app.features.expenses.models import ExpenseReceiptIntakeStatus
from app.features.expenses.schema import ConfirmExpenseReceiptRequest

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")

_MULTI_LINE_RECEIPT = (
    b"Tarih: 23.06.2026\n"
    b"peynir 150,00\n"
    b"sut 80,00\n"
    b"Bahsis: 20,00\n"
    b"Toplam: 250,00\n"
)


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


def test_multi_line_receipt_creates_intake_with_lines(db_session, restaurant_a) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    general_id = accounts[GENERAL_EXPENSE_CODE].id
    tips_id = accounts[TIPS_EXPENSE_CODE].id

    intake = receipt_service.create_expense_receipt_from_upload(
        db_session,
        restaurant_a.id,
        _MULTI_LINE_RECEIPT,
        money_account_id=drawer.id,
        actor_id=ACTOR_ID,
        filename="receipt.txt",
        content_type="text/plain",
    )

    assert intake.status in {
        ExpenseReceiptIntakeStatus.DRAFT,
        ExpenseReceiptIntakeStatus.NEEDS_REVIEW,
    }
    assert len(intake.lines) == 3
    descriptions = {line.written_item_description for line in intake.lines}
    assert "peynir" in descriptions
    assert "sut" in descriptions
    tip_line = next(
        line for line in intake.lines if line.expense_account_id == tips_id
    )
    assert tip_line.amount_kurus == 2_000
    grocery_lines = [
        line for line in intake.lines if line.expense_account_id == general_id
    ]
    assert len(grocery_lines) == 2
    assert intake.receipt_total_kurus == 25_000


def test_confirm_posts_all_lines_dr_expense_cr_cash(db_session, restaurant_a) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    general_id = accounts[GENERAL_EXPENSE_CODE].id
    tips_id = accounts[TIPS_EXPENSE_CODE].id
    drawer_gl_id = drawer.gl_account_id

    intake = receipt_service.create_expense_receipt_from_upload(
        db_session,
        restaurant_a.id,
        _MULTI_LINE_RECEIPT,
        money_account_id=drawer.id,
        actor_id=ACTOR_ID,
    )

    posted = receipt_service.confirm_expense_receipt(
        db_session,
        restaurant_a.id,
        intake.id,
        ConfirmExpenseReceiptRequest(actor_id=ACTOR_ID),
    )

    assert posted.status == ExpenseReceiptIntakeStatus.POSTED
    assert all(line.expense_entry_id is not None for line in posted.lines)

    assert _gl_balance(db_session, restaurant_a.id, general_id, AccountNormalBalance.DEBIT) == 23_000
    assert _gl_balance(db_session, restaurant_a.id, tips_id, AccountNormalBalance.DEBIT) == 2_000
    assert (
        _gl_balance(db_session, restaurant_a.id, drawer_gl_id, AccountNormalBalance.DEBIT)
        == -25_000
    )


def test_duplicate_receipt_rejected(db_session, restaurant_a) -> None:
    drawer, _ = _setup(db_session, restaurant_a)

    first = receipt_service.create_expense_receipt_from_upload(
        db_session,
        restaurant_a.id,
        _MULTI_LINE_RECEIPT,
        money_account_id=drawer.id,
        actor_id=ACTOR_ID,
    )

    with pytest.raises(receipt_service.DuplicateExpenseReceiptError) as exc:
        receipt_service.create_expense_receipt_from_upload(
            db_session,
            restaurant_a.id,
            _MULTI_LINE_RECEIPT,
            money_account_id=drawer.id,
            actor_id=ACTOR_ID,
        )
    assert exc.value.existing.id == first.id


def test_confirm_twice_does_not_double_post(db_session, restaurant_a) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    general_id = accounts[GENERAL_EXPENSE_CODE].id

    intake = receipt_service.create_expense_receipt_from_upload(
        db_session,
        restaurant_a.id,
        _MULTI_LINE_RECEIPT,
        money_account_id=drawer.id,
        actor_id=ACTOR_ID,
    )
    receipt_service.confirm_expense_receipt(
        db_session,
        restaurant_a.id,
        intake.id,
        ConfirmExpenseReceiptRequest(actor_id=ACTOR_ID),
    )

    with pytest.raises(receipt_service.ExpenseReceiptNotReviewableError):
        receipt_service.confirm_expense_receipt(
            db_session,
            restaurant_a.id,
            intake.id,
            ConfirmExpenseReceiptRequest(actor_id=ACTOR_ID),
        )

    assert _gl_balance(db_session, restaurant_a.id, general_id, AccountNormalBalance.DEBIT) == 23_000


def test_registered_fixture_multi_line(db_session, restaurant_a) -> None:
    drawer, _ = _setup(db_session, restaurant_a)
    image = b"\x89PNG\r\n\x1a\nMIZAN-RECEIPT-FIXTURE-001"
    register_expense_receipt_fixture(
        image,
        {
            "expense_date": date(2026, 6, 20),
            "receipt_total_kurus": 10_000,
            "lines": [
                {"description": "peynir", "amount_kurus": 8_000, "is_tip": False},
                {"description": "Bahşiş", "amount_kurus": 2_000, "is_tip": True},
            ],
        },
    )

    intake = receipt_service.create_expense_receipt_from_upload(
        db_session,
        restaurant_a.id,
        image,
        money_account_id=drawer.id,
        actor_id=ACTOR_ID,
        filename="receipt.png",
        content_type="image/png",
    )

    assert len(intake.lines) == 2
    assert intake.expense_date == date(2026, 6, 20)


def test_upload_and_confirm_via_api(client, db_session, restaurant_a) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    general_id = accounts[GENERAL_EXPENSE_CODE].id
    entity_id = restaurant_a.id

    upload = client.post(
        f"/entities/{entity_id}/expense-receipts",
        files={"file": ("receipt.txt", _MULTI_LINE_RECEIPT, "text/plain")},
        data={"money_account_id": str(drawer.id), "actor_id": str(ACTOR_ID)},
    )
    assert upload.status_code == 201, upload.text
    intake_id = upload.json()["id"]

    confirm = client.post(
        f"/entities/{entity_id}/expense-receipts/{intake_id}/confirm",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert confirm.status_code == 200, confirm.text
    assert confirm.json()["status"] == "posted"

    assert _gl_balance(db_session, entity_id, general_id, AccountNormalBalance.DEBIT) == 23_000
