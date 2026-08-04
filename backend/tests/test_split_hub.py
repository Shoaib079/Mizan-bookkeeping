"""Split hub — bank expense personal peel onto partner drawing."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import OWNER_DRAWINGS_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.core.partners import posting as partner_posting
from app.core.partners.posting import InvalidPartnerPostingError
from app.core.partners.types import PartnerMovementType
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import StatementLineClassification
from app.features.partners.models import Partner

RENT_EXPENSE_CODE = "5000"
ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def split_hub_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Garanti TRY",
            bank_name="Garanti BBVA",
        ),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        partner = Partner(name="Split Partner")
        db_session.add(partner)
        db_session.commit()
        db_session.refresh(partner)
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "accounts": accounts,
        "partner_id": partner.id,
    }


def _post_bank_expense(db_session, setup, *, amount_kurus: int, description: str):
    entity_id = setup["entity_id"]
    bank = setup["bank"]
    rent_id = setup["accounts"][RENT_EXPENSE_CODE]
    whole, frac = divmod(amount_kurus, 100)
    amount_tr = f"-{whole},{frac:02d}"
    csv = (
        "transaction_date,amount,description,reference\n"
        f"2026-07-15,\"{amount_tr}\",{description},SGK-1\n"
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename=f"sgk-{amount_kurus}.csv",
    )
    line = statement.lines[0]
    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line.id,
        classification=StatementLineClassification.RENT_UTILITY,
        actor_id=ACTOR_ID,
        expense_account_id=rent_id,
    )
    assert result.line.expense_entry_id is not None
    return result.line.expense_entry_id


def _gl_balance(db_session, entity_id, account_id, normal):
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


def test_bank_expense_personal_split_reclass(db_session, split_hub_setup) -> None:
    setup = split_hub_setup
    expense_id = _post_bank_expense(
        db_session, setup, amount_kurus=100_000, description="SGK odemesi"
    )
    rent_id = setup["accounts"][RENT_EXPENSE_CODE]
    drawings_id = setup["accounts"][OWNER_DRAWINGS_CODE]

    expense_before = _gl_balance(
        db_session, setup["entity_id"], rent_id, AccountNormalBalance.DEBIT
    )
    assert expense_before == 100_000

    result = partner_posting.post_expense_personal_split(
        db_session,
        setup["entity_id"],
        setup["partner_id"],
        expense_id=expense_id,
        personal_amount_kurus=30_000,
        note="Personal SGK",
        actor_id=ACTOR_ID,
    )
    assert result.personal_amount_kurus == 30_000
    assert result.restaurant_amount_kurus == 70_000
    assert result.remaining_splittable_kurus == 70_000
    assert result.partner_ledger_entry.movement_type == PartnerMovementType.DRAWING
    assert result.partner_ledger_entry.amount_kurus == -30_000

    with entity_context(db_session, setup["entity_id"]):
        je = db_session.get(JournalEntry, result.journal_entry.id)
        assert je is not None
        assert je.source == JournalEntrySource.EXPENSE_PERSONAL_SPLIT

    assert (
        _gl_balance(
            db_session, setup["entity_id"], rent_id, AccountNormalBalance.DEBIT
        )
        == 70_000
    )
    assert (
        _gl_balance(
            db_session, setup["entity_id"], drawings_id, AccountNormalBalance.DEBIT
        )
        == 30_000
    )


def test_split_rejects_over_remaining(db_session, split_hub_setup) -> None:
    setup = split_hub_setup
    expense_id = _post_bank_expense(
        db_session, setup, amount_kurus=50_000, description="SGK"
    )
    partner_posting.post_expense_personal_split(
        db_session,
        setup["entity_id"],
        setup["partner_id"],
        expense_id=expense_id,
        personal_amount_kurus=40_000,
        note="First",
        actor_id=ACTOR_ID,
    )
    with pytest.raises(InvalidPartnerPostingError, match="remaining"):
        partner_posting.post_expense_personal_split(
            db_session,
            setup["entity_id"],
            setup["partner_id"],
            expense_id=expense_id,
            personal_amount_kurus=20_000,
            note="Too much",
            actor_id=ACTOR_ID,
        )


def test_split_rejects_cash_only_expense(db_session, split_hub_setup) -> None:
    from app.features.expenses.schema import ExpenseCreate
    from app.features.expenses.service import create_expense

    setup = split_hub_setup
    drawer = banking_service.create_money_account(
        db_session,
        setup["entity_id"],
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Drawer"),
    )
    expense = create_expense(
        db_session,
        setup["entity_id"],
        ExpenseCreate(
            expense_date=date(2026, 7, 20),
            amount_kurus=10_000,
            expense_account_id=setup["accounts"][RENT_EXPENSE_CODE],
            money_account_id=drawer.id,
            description="Cash only",
            actor_id=ACTOR_ID,
        ),
    )
    with pytest.raises(InvalidPartnerPostingError, match="bank-linked"):
        partner_posting.post_expense_personal_split(
            db_session,
            setup["entity_id"],
            setup["partner_id"],
            expense_id=expense.id,
            personal_amount_kurus=5_000,
            note="Nope",
            actor_id=ACTOR_ID,
        )


def test_split_hub_http(client, db_session, split_hub_setup) -> None:
    setup = split_hub_setup
    expense_id = _post_bank_expense(
        db_session, setup, amount_kurus=80_000, description="SGK HTTP"
    )
    listed = client.get(
        f"/entities/{setup['entity_id']}/splits/bank-expenses?limit=50"
    )
    assert listed.status_code == 200, listed.text
    items = listed.json()["items"]
    assert any(row["expense_id"] == str(expense_id) for row in items)

    response = client.post(
        f"/entities/{setup['entity_id']}/splits/bank-expenses",
        json={
            "expense_id": str(expense_id),
            "partner_id": str(setup["partner_id"]),
            "personal_amount_kurus": 25_000,
            "note": "My share",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["personal_amount_kurus"] == 25_000
    assert body["restaurant_amount_kurus"] == 55_000
    assert body["remaining_splittable_kurus"] == 55_000


def test_supplier_payment_personal_split(db_session, split_hub_setup) -> None:
    from app.core.payables import posting as payables_posting
    from app.core.payables.models import SupplierLedgerEntry
    from app.core.payables.types import SupplierMovementType
    from app.features.suppliers.models import Supplier

    setup = split_hub_setup
    rent_id = setup["accounts"][RENT_EXPENSE_CODE]
    drawings_id = setup["accounts"][OWNER_DRAWINGS_CODE]

    with entity_context(db_session, setup["entity_id"]):
        supplier = Supplier(name="Metro", vkn="1112223334")
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        supplier_id = supplier.id

    payables_posting.post_supplier_manual_movement(
        db_session,
        setup["entity_id"],
        supplier_id,
        movement_date=date(2026, 7, 1),
        movement_type=SupplierMovementType.OPENING_BALANCE,
        amount_kurus=200_000,
        description="Metro AP",
        actor_id=ACTOR_ID,
    )
    payment = payables_posting.post_supplier_payment(
        db_session,
        setup["entity_id"],
        supplier_id,
        payment_date=date(2026, 7, 10),
        amount_kurus=200_000,
        description="Metro bank payment",
        actor_id=ACTOR_ID,
        payment_account_id=setup["bank"].gl_account_id,
    )

    with entity_context(db_session, setup["entity_id"]):
        ledger_row = db_session.scalar(
            select(SupplierLedgerEntry).where(
                SupplierLedgerEntry.journal_entry_id == payment.journal_entry.id
            )
        )
        assert ledger_row is not None
        payment_ledger_id = ledger_row.id

    result = partner_posting.post_supplier_payment_personal_split(
        db_session,
        setup["entity_id"],
        setup["partner_id"],
        supplier_ledger_entry_id=payment_ledger_id,
        personal_amount_kurus=40_000,
        expense_account_id=rent_id,
        note="Partner personal Metro",
        actor_id=ACTOR_ID,
    )
    assert result.personal_amount_kurus == 40_000
    assert result.restaurant_amount_kurus == 160_000
    assert result.remaining_splittable_kurus == 160_000
    assert (
        _gl_balance(
            db_session, setup["entity_id"], drawings_id, AccountNormalBalance.DEBIT
        )
        == 40_000
    )
    assert (
        _gl_balance(
            db_session, setup["entity_id"], rent_id, AccountNormalBalance.DEBIT
        )
        == -40_000
    )


def test_supplier_payment_split_http(client, db_session, split_hub_setup) -> None:
    from app.core.payables import posting as payables_posting
    from app.core.payables.models import SupplierLedgerEntry
    from app.core.payables.types import SupplierMovementType
    from app.features.suppliers.models import Supplier

    setup = split_hub_setup
    with entity_context(db_session, setup["entity_id"]):
        supplier = Supplier(name="BIM Split", vkn="5556667778")
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        supplier_id = supplier.id

    payables_posting.post_supplier_manual_movement(
        db_session,
        setup["entity_id"],
        supplier_id,
        movement_date=date(2026, 7, 1),
        movement_type=SupplierMovementType.OPENING_BALANCE,
        amount_kurus=90_000,
        description="BIM AP",
        actor_id=ACTOR_ID,
    )
    payment = payables_posting.post_supplier_payment(
        db_session,
        setup["entity_id"],
        supplier_id,
        payment_date=date(2026, 7, 11),
        amount_kurus=90_000,
        description="BIM payment",
        actor_id=ACTOR_ID,
        payment_account_id=setup["bank"].gl_account_id,
    )
    with entity_context(db_session, setup["entity_id"]):
        ledger_row = db_session.scalar(
            select(SupplierLedgerEntry).where(
                SupplierLedgerEntry.journal_entry_id == payment.journal_entry.id
            )
        )
        assert ledger_row is not None
        payment_ledger_id = ledger_row.id

    listed = client.get(
        f"/entities/{setup['entity_id']}/splits/supplier-payments?limit=50"
    )
    assert listed.status_code == 200, listed.text
    assert any(
        row["supplier_ledger_entry_id"] == str(payment_ledger_id)
        for row in listed.json()["items"]
    )

    response = client.post(
        f"/entities/{setup['entity_id']}/splits/supplier-payments",
        json={
            "supplier_ledger_entry_id": str(payment_ledger_id),
            "partner_id": str(setup["partner_id"]),
            "personal_amount_kurus": 15_000,
            "expense_account_id": str(setup["accounts"][RENT_EXPENSE_CODE]),
            "note": "Personal BIM",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["personal_amount_kurus"] == 15_000
    assert body["restaurant_amount_kurus"] == 75_000
