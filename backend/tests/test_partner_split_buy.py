"""Partner split buy — amount split + optional invoice # (Decisions 2026-08-04)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_PAYABLE_CODE,
    PARTNER_REIMBURSEMENT_PAYABLE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.core.partners import ledger as partner_ledger
from app.core.partners import posting as partner_posting
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.posting import InvalidPartnerPostingError
from app.core.partners.types import PartnerMovementType
from app.core.payables import ledger as payables_ledger
from app.core.payables import posting as payables_posting
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.db.session import entity_context
from app.features.partners.models import Partner
from app.features.suppliers.models import Supplier


ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def split_buy_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        partner = Partner(name="Split Partner")
        supplier = Supplier(name="Metro", vkn="9988776655")
        db_session.add_all([partner, supplier])
        db_session.commit()
        db_session.refresh(partner)
        db_session.refresh(supplier)
    return {
        "entity_id": restaurant_a.id,
        "accounts": accounts,
        "partner_id": partner.id,
        "supplier_id": supplier.id,
    }


def _raise_payable(db_session, setup, amount_kurus: int) -> None:
    payables_posting.post_supplier_manual_movement(
        db_session,
        setup["entity_id"],
        setup["supplier_id"],
        movement_date=date(2026, 6, 1),
        movement_type=SupplierMovementType.OPENING_BALANCE,
        amount_kurus=amount_kurus,
        description="Supplier payable for split tests",
        actor_id=ACTOR_ID,
    )


def _gl_balance(
    db_session,
    entity_id: uuid.UUID,
    account_id: uuid.UUID,
    normal: AccountNormalBalance,
) -> int:
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


def test_compose_description_note_invoice_personal_restaurant() -> None:
    text = partner_posting.compose_split_buy_description(
        note="Metro Saturday",
        invoice_number="INV-9",
        restaurant_amount_kurus=100_00,
        personal_amount_kurus=50_00,
    )
    assert text.startswith("Metro Saturday")
    assert "Invoice INV-9" in text
    assert "Personal 50,00" in text
    assert "Restaurant 100,00" in text


def test_pocket_split_fronts_restaurant_and_describes_personal(
    db_session, split_buy_setup
) -> None:
    setup = split_buy_setup
    expense_id = setup["accounts"]["5200"]

    result = partner_posting.post_partner_split_buy(
        db_session,
        setup["entity_id"],
        setup["partner_id"],
        expense_date=date(2026, 7, 1),
        restaurant_amount_kurus=80_000,
        personal_amount_kurus=20_000,
        note="Metro run",
        invoice_number="M-1",
        actor_id=ACTOR_ID,
        expense_account_id=expense_id,
    )

    assert "Metro run" in result.description
    assert "Invoice M-1" in result.description
    assert "Personal" in result.description
    assert result.partner_ledger_entry is not None
    assert result.partner_ledger_entry.movement_type == PartnerMovementType.EXPENSE_FRONTED
    assert result.partner_ledger_entry.amount_kurus == 80_000
    assert result.balance_kurus == 80_000

    with entity_context(db_session, setup["entity_id"]):
        je = db_session.get(JournalEntry, result.journal_entry_ids[0])
        assert je is not None
        assert je.source == JournalEntrySource.PARTNER_EXPENSE_FRONTED

    assert (
        _gl_balance(
            db_session,
            setup["entity_id"],
            setup["accounts"][PARTNER_REIMBURSEMENT_PAYABLE_CODE],
            AccountNormalBalance.CREDIT,
        )
        == 80_000
    )
    assert (
        _gl_balance(
            db_session, setup["entity_id"], expense_id, AccountNormalBalance.DEBIT
        )
        == 80_000
    )


def test_pocket_personal_only_rejected(db_session, split_buy_setup) -> None:
    with pytest.raises(InvalidPartnerPostingError, match="Restaurant amount"):
        partner_posting.post_partner_split_buy(
            db_session,
            split_buy_setup["entity_id"],
            split_buy_setup["partner_id"],
            expense_date=date(2026, 7, 1),
            restaurant_amount_kurus=0,
            personal_amount_kurus=10_000,
            note="Personal only",
            actor_id=ACTOR_ID,
            expense_account_id=split_buy_setup["accounts"]["5200"],
        )


def test_ap_clear_restaurant_only(db_session, split_buy_setup) -> None:
    setup = split_buy_setup
    _raise_payable(db_session, setup, 500_000)

    result = partner_posting.post_partner_split_buy(
        db_session,
        setup["entity_id"],
        setup["partner_id"],
        expense_date=date(2026, 7, 2),
        restaurant_amount_kurus=200_000,
        personal_amount_kurus=0,
        note="Paid Metro AP",
        actor_id=ACTOR_ID,
        supplier_id=setup["supplier_id"],
    )

    assert result.partner_ledger_entry is not None
    assert result.partner_ledger_entry.amount_kurus == 200_000
    assert partner_ledger.reimbursement_balance_kurus(
        db_session, setup["entity_id"], setup["partner_id"]
    ) == 200_000
    assert payables_ledger.current_balance_kurus(
        db_session, setup["entity_id"], setup["supplier_id"]
    ) == 300_000

    with entity_context(db_session, setup["entity_id"]):
        je = db_session.get(JournalEntry, result.journal_entry_ids[0])
        assert je is not None
        assert je.source == JournalEntrySource.PARTNER_SUPPLIER_PAID
        supplier_rows = list(
            db_session.scalars(
                select(SupplierLedgerEntry).where(
                    SupplierLedgerEntry.journal_entry_id == je.id
                )
            )
        )
        assert len(supplier_rows) == 1
        assert supplier_rows[0].amount_kurus == -200_000

    assert (
        _gl_balance(
            db_session,
            setup["entity_id"],
            setup["accounts"][ACCOUNTS_PAYABLE_CODE],
            AccountNormalBalance.CREDIT,
        )
        == 300_000
    )
    assert (
        _gl_balance(
            db_session,
            setup["entity_id"],
            setup["accounts"][PARTNER_REIMBURSEMENT_PAYABLE_CODE],
            AccountNormalBalance.CREDIT,
        )
        == 200_000
    )


def test_ap_clear_with_personal_expense_reversal(db_session, split_buy_setup) -> None:
    setup = split_buy_setup
    expense_id = setup["accounts"]["5200"]
    _raise_payable(db_session, setup, 400_000)

    result = partner_posting.post_partner_split_buy(
        db_session,
        setup["entity_id"],
        setup["partner_id"],
        expense_date=date(2026, 7, 3),
        restaurant_amount_kurus=150_000,
        personal_amount_kurus=50_000,
        note="Mixed Metro",
        invoice_number="42",
        actor_id=ACTOR_ID,
        expense_account_id=expense_id,
        supplier_id=setup["supplier_id"],
    )

    assert "Invoice 42" in result.description
    assert result.partner_ledger_entry is not None
    assert result.partner_ledger_entry.amount_kurus == 150_000
    # Personal share must not invent a partner balance row.
    with entity_context(db_session, setup["entity_id"]):
        partner_rows = list(
            db_session.scalars(
                select(PartnerLedgerEntry).where(
                    PartnerLedgerEntry.journal_entry_id == result.journal_entry_ids[0]
                )
            )
        )
        assert len(partner_rows) == 1

    assert payables_ledger.current_balance_kurus(
        db_session, setup["entity_id"], setup["supplier_id"]
    ) == 200_000
    assert (
        _gl_balance(
            db_session, setup["entity_id"], expense_id, AccountNormalBalance.DEBIT
        )
        == -50_000
    )


def test_ap_clear_rejects_over_payable(db_session, split_buy_setup) -> None:
    setup = split_buy_setup
    _raise_payable(db_session, setup, 100_000)

    with pytest.raises(InvalidPartnerPostingError, match="exceeds supplier payable"):
        partner_posting.post_partner_split_buy(
            db_session,
            setup["entity_id"],
            setup["partner_id"],
            expense_date=date(2026, 7, 4),
            restaurant_amount_kurus=80_000,
            personal_amount_kurus=30_000,
            note="Too much",
            actor_id=ACTOR_ID,
            expense_account_id=setup["accounts"]["5200"],
            supplier_id=setup["supplier_id"],
        )


def test_note_required(db_session, split_buy_setup) -> None:
    with pytest.raises(ValueError, match="note is required"):
        partner_posting.post_partner_split_buy(
            db_session,
            split_buy_setup["entity_id"],
            split_buy_setup["partner_id"],
            expense_date=date(2026, 7, 5),
            restaurant_amount_kurus=10_000,
            personal_amount_kurus=0,
            note="   ",
            actor_id=ACTOR_ID,
            expense_account_id=split_buy_setup["accounts"]["5200"],
        )


def test_split_buy_http(client, db_session, split_buy_setup) -> None:
    setup = split_buy_setup
    _raise_payable(db_session, setup, 250_000)

    response = client.post(
        f"/entities/{setup['entity_id']}/partners/{setup['partner_id']}/split-buys",
        json={
            "expense_date": "2026-07-06",
            "restaurant_amount_kurus": 100_000,
            "personal_amount_kurus": 25_000,
            "note": "HTTP split",
            "invoice_number": "H-1",
            "expense_account_id": str(setup["accounts"]["5200"]),
            "supplier_id": str(setup["supplier_id"]),
            "actor_id": str(ACTOR_ID),
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["balance_kurus"] == 100_000
    assert body["partner_ledger_entry"]["amount_kurus"] == 100_000
    assert "Invoice H-1" in body["description"]
    assert len(body["journal_entry_ids"]) == 1
