"""Expense receipt OCR — multi-line intake, confirm posts N cash expenses (Phase 8.7)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.adapters.ocr_ai.expense_receipt import register_expense_receipt_fixture
from app.core.chart_of_accounts.default_chart import GENERAL_EXPENSE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntryLine
from app.features.reports import financial_statements
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.expenses import receipt_service
from app.features.expenses.models import (
    ExpenseReceiptIntake,
    ExpenseReceiptIntakeStatus,
    ExpenseReceiptLine,
)
from app.features.expenses.schema import (
    ConfirmExpenseReceiptLineRequest,
    ConfirmExpenseReceiptRequest,
)

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
        line
        for line in intake.lines
        if (line.written_item_description or "").lower().startswith("bah")
    )
    assert tip_line.expense_account_id == general_id
    assert tip_line.amount_kurus == 2_000
    grocery_lines = [
        line for line in intake.lines if line.expense_account_id == general_id
    ]
    assert len(grocery_lines) == 3
    assert intake.receipt_total_kurus == 25_000


def test_confirm_posts_all_lines_dr_expense_cr_cash(db_session, restaurant_a) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    general_id = accounts[GENERAL_EXPENSE_CODE].id
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

    assert _gl_balance(db_session, restaurant_a.id, general_id, AccountNormalBalance.DEBIT) == 25_000
    assert (
        _gl_balance(db_session, restaurant_a.id, drawer_gl_id, AccountNormalBalance.DEBIT)
        == -25_000
    )


def test_expense_tip_line_rolls_into_pl_and_balance_sheet(db_session, restaurant_a) -> None:
    """Bahşiş on the expense paper hits P&L (general expense) and reduces cash."""
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

    period_from = date(2026, 6, 1)
    period_to = date(2026, 6, 30)
    pl = financial_statements.get_profit_and_loss(
        db_session, restaurant_a.id, period_from, period_to
    )
    general_line = next(
        (row for row in pl.accounts if row.account_id == general_id),
        None,
    )
    assert general_line is not None
    assert general_line.amount_kurus == 25_000

    bs = financial_statements.get_balance_sheet(db_session, restaurant_a.id, period_to)
    cash_row = next(
        (row for row in bs.assets.accounts if row.account_id == drawer.gl_account_id),
        None,
    )
    assert cash_row is not None
    assert cash_row.balance_kurus == -25_000


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

    assert _gl_balance(db_session, restaurant_a.id, general_id, AccountNormalBalance.DEBIT) == 25_000


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


def test_confirm_blocked_when_line_sum_mismatches_receipt_total(
    db_session, restaurant_a
) -> None:
    """Line total must match receipt_total_kurus before confirm (Phase 8.8 H3)."""
    drawer, _ = _setup(db_session, restaurant_a)
    image = b"\x89PNG\r\n\x1a\nMIZAN-RECEIPT-MISMATCH-001"
    register_expense_receipt_fixture(
        image,
        {
            "expense_date": date(2026, 6, 20),
            "receipt_total_kurus": 10_000,
            "lines": [
                {"description": "peynir", "amount_kurus": 8_000, "is_tip": False},
                {"description": "sut", "amount_kurus": 1_000, "is_tip": False},
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

    assert intake.status == ExpenseReceiptIntakeStatus.NEEDS_REVIEW
    assert intake.receipt_total_kurus == 10_000
    assert sum(line.amount_kurus for line in intake.lines) == 9_000

    with pytest.raises(receipt_service.ExpenseReceiptNotReviewableError) as exc:
        receipt_service.confirm_expense_receipt(
            db_session,
            restaurant_a.id,
            intake.id,
            ConfirmExpenseReceiptRequest(actor_id=ACTOR_ID),
        )
    assert "does not match receipt total" in str(exc.value)


def test_confirm_succeeds_after_override_fixes_receipt_total_mismatch(
    db_session, restaurant_a
) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    general_id = accounts[GENERAL_EXPENSE_CODE].id
    image = b"\x89PNG\r\n\x1a\nMIZAN-RECEIPT-MISMATCH-002"
    register_expense_receipt_fixture(
        image,
        {
            "expense_date": date(2026, 6, 20),
            "receipt_total_kurus": 10_000,
            "lines": [
                {"description": "peynir", "amount_kurus": 8_000, "is_tip": False},
                {"description": "sut", "amount_kurus": 1_000, "is_tip": False},
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
    sut_line = next(
        line for line in intake.lines if line.written_item_description == "sut"
    )

    posted = receipt_service.confirm_expense_receipt(
        db_session,
        restaurant_a.id,
        intake.id,
        ConfirmExpenseReceiptRequest(
            actor_id=ACTOR_ID,
            lines=[
                ConfirmExpenseReceiptLineRequest(
                    line_id=sut_line.id,
                    amount_kurus=2_000,
                )
            ],
        ),
    )

    assert posted.status == ExpenseReceiptIntakeStatus.POSTED
    assert _gl_balance(db_session, restaurant_a.id, general_id, AccountNormalBalance.DEBIT) == 10_000


def test_cross_entity_expense_receipt_isolation(
    client, db_session, restaurant_a, restaurant_b
) -> None:
    drawer, _ = _setup(db_session, restaurant_a)
    seed_default_chart(db_session, restaurant_b.id)

    intake = receipt_service.create_expense_receipt_from_upload(
        db_session,
        restaurant_a.id,
        _MULTI_LINE_RECEIPT,
        money_account_id=drawer.id,
        actor_id=ACTOR_ID,
    )

    get_b = client.get(
        f"/entities/{restaurant_b.id}/expense-receipts/{intake.id}",
    )
    assert get_b.status_code == 404

    confirm_b = client.post(
        f"/entities/{restaurant_b.id}/expense-receipts/{intake.id}/confirm",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert confirm_b.status_code == 404

    with pytest.raises(LookupError):
        receipt_service.get_expense_receipt(db_session, restaurant_b.id, intake.id)

    with pytest.raises(LookupError):
        receipt_service.confirm_expense_receipt(
            db_session,
            restaurant_b.id,
            intake.id,
            ConfirmExpenseReceiptRequest(actor_id=ACTOR_ID),
        )


def test_rls_hides_other_entity_expense_receipts(
    db_session, restaurant_a, restaurant_b
) -> None:
    drawer, _ = _setup(db_session, restaurant_a)
    seed_default_chart(db_session, restaurant_b.id)

    intake = receipt_service.create_expense_receipt_from_upload(
        db_session,
        restaurant_a.id,
        _MULTI_LINE_RECEIPT,
        money_account_id=drawer.id,
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, restaurant_a.id):
        assert db_session.get(ExpenseReceiptIntake, intake.id) is not None
        visible_lines = list(db_session.scalars(select(ExpenseReceiptLine)))
        assert len(visible_lines) == len(intake.lines)

    with entity_context(db_session, restaurant_b.id):
        assert db_session.get(ExpenseReceiptIntake, intake.id) is None
        assert list(db_session.scalars(select(ExpenseReceiptIntake))) == []
        assert list(db_session.scalars(select(ExpenseReceiptLine))) == []
        assert (
            db_session.scalar(
                select(ExpenseReceiptLine).where(
                    ExpenseReceiptLine.intake_id == intake.id
                )
            )
            is None
        )


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

    assert _gl_balance(db_session, entity_id, general_id, AccountNormalBalance.DEBIT) == 25_000
