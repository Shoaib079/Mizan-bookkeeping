"""Bank/cash account tree — GL sub-accounts, balances, API (Phase 3 Slice 1)."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.invoices.posting import post_confirmed_draft
from app.core.ledger.models import JournalEntryLine, JournalEntrySource
from app.core.ledger.posting import PostingLine, post_journal_entry
from app.core.payables import posting as payables_posting
from app.db.session import entity_context
from app.features.banking import service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate, MoneyAccountUpdate
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus
from app.features.invoices import service as invoice_service
from app.features.suppliers.models import Supplier

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura"
SAMPLE_XML = FIXTURES / "sample.xml"
ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def seeded_accounts(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = list(db_session.scalars(select(Account)))
    return {account.code: account.id for account in accounts}


def _bank_payload(**overrides) -> MoneyAccountCreate:
    base = {
        "account_kind": MoneyAccountKind.BANK,
        "name": "Garanti TRY",
        "bank_name": "Garanti BBVA",
        "iban": "TR330006100519786457841326",
        "last_four": "4326",
    }
    base.update(overrides)
    return MoneyAccountCreate(**base)


def _cash_payload(**overrides) -> MoneyAccountCreate:
    base = {"account_kind": MoneyAccountKind.CASH, "name": "Main Drawer"}
    base.update(overrides)
    return MoneyAccountCreate(**base)


def test_create_bank_and_cash_sub_accounts(db_session, restaurant_a, seeded_accounts) -> None:
    bank = service.create_money_account(db_session, restaurant_a.id, _bank_payload())
    cash = service.create_money_account(db_session, restaurant_a.id, _cash_payload())

    assert bank.account_kind == MoneyAccountKind.BANK
    assert bank.gl_account_code == "1101"
    assert cash.account_kind == MoneyAccountKind.CASH
    assert cash.gl_account_code == "1001"

    with entity_context(db_session, restaurant_a.id):
        gl_bank = db_session.get(Account, bank.gl_account_id)
        gl_cash = db_session.get(Account, cash.gl_account_id)
        assert gl_bank is not None
        assert gl_cash is not None
        assert gl_bank.parent_account_id == seeded_accounts["1100"]
        assert gl_cash.parent_account_id == seeded_accounts["1000"]
        assert gl_bank.accepts_opening_balance is True
        assert gl_cash.accepts_opening_balance is True


def test_sub_account_codes_increment(db_session, restaurant_a, seeded_accounts) -> None:
    first = service.create_money_account(
        db_session, restaurant_a.id, _bank_payload(name="Bank A")
    )
    second = service.create_money_account(
        db_session, restaurant_a.id, _bank_payload(name="Bank B", iban=None, last_four=None)
    )
    assert first.gl_account_code == "1101"
    assert second.gl_account_code == "1102"


def test_leaf_balance_and_parent_rollup(db_session, restaurant_a, seeded_accounts) -> None:
    bank_a = service.create_money_account(
        db_session, restaurant_a.id, _bank_payload(name="Bank A")
    )
    bank_b = service.create_money_account(
        db_session, restaurant_a.id, _bank_payload(name="Bank B", iban=None, last_four=None)
    )

    ap_id = seeded_accounts["2000"]
    post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 15),
        "Opening bank A",
        [
            PostingLine(bank_a.gl_account_id, 500_000, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 500_000, AccountNormalBalance.CREDIT),
        ],
        actor_id=ACTOR_ID,
        source=JournalEntrySource.MANUAL,
    )
    post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 15),
        "Opening bank B",
        [
            PostingLine(bank_b.gl_account_id, 300_000, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 300_000, AccountNormalBalance.CREDIT),
        ],
        actor_id=ACTOR_ID,
        source=JournalEntrySource.MANUAL,
    )

    tree = service.get_account_tree(db_session, restaurant_a.id)
    assert tree.banks.balance_kurus == 800_000
    assert {leaf.balance_kurus for leaf in tree.banks.accounts} == {500_000, 300_000}
    assert service.rollup_child_balances(
        [leaf.balance_kurus for leaf in tree.banks.accounts]
    ) == tree.banks.balance_kurus


def test_cross_entity_isolation(
    db_session, restaurant_a, restaurant_b, seeded_accounts
) -> None:
    seed_default_chart(db_session, restaurant_b.id)
    created = service.create_money_account(db_session, restaurant_a.id, _bank_payload())

    with entity_context(db_session, restaurant_b.id):
        visible = list(db_session.scalars(select(Account).where(Account.code == "1101")))
        assert visible == []

    with pytest.raises(LookupError):
        service.get_money_account(db_session, restaurant_b.id, created.id)


def test_duplicate_name_rejected(db_session, restaurant_a, seeded_accounts) -> None:
    service.create_money_account(db_session, restaurant_a.id, _bank_payload())
    with pytest.raises(service.DuplicateMoneyAccountError):
        service.create_money_account(
            db_session,
            restaurant_a.id,
            _cash_payload(name="Garanti TRY"),
        )


def test_create_before_chart_seeded_fails(db_session, restaurant_a) -> None:
    with pytest.raises(service.ChartNotSeededError, match="Chart not seeded"):
        service.create_money_account(db_session, restaurant_a.id, _bank_payload())


def test_api_crud_and_tree(
    client: TestClient, restaurant_a, seeded_accounts
) -> None:
    base = f"/entities/{restaurant_a.id}/banking/accounts"

    create_resp = client.post(
        base,
        json={
            "account_kind": "bank",
            "name": "İşbank TRY",
            "bank_name": "İş Bankası",
            "iban": "TR330006100519786457841326",
            "last_four": "1326",
        },
    )
    assert create_resp.status_code == 201
    body = create_resp.json()
    assert body["gl_account_code"] == "1101"
    account_id = body["id"]

    list_resp = client.get(f"{base}?account_kind=bank")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    get_resp = client.get(f"{base}/{account_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "İşbank TRY"

    tree_resp = client.get(f"{base}/tree")
    assert tree_resp.status_code == 200
    tree = tree_resp.json()
    assert tree["banks"]["bucket_code"] == "1100"
    assert tree["cash"]["bucket_code"] == "1000"
    assert len(tree["banks"]["accounts"]) == 1

    patch_resp = client.patch(
        f"{base}/{account_id}",
        json={"name": "İşbank Main", "is_active": False},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["is_active"] is False

    inactive_hidden = client.get(base)
    assert inactive_hidden.json() == []


def test_api_create_before_chart_seeded(client: TestClient, restaurant_a) -> None:
    resp = client.post(
        f"/entities/{restaurant_a.id}/banking/accounts",
        json={"account_kind": "bank", "name": "Too Early"},
    )
    assert resp.status_code == 409
    assert "Chart not seeded" in resp.json()["detail"]


def _supplier_and_draft(db_session, entity) -> tuple[uuid.UUID, InvoiceDraft]:
    with entity_context(db_session, entity.id):
        supplier = Supplier(name="Metro Gida", vkn="1234567890")
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        supplier_id = supplier.id

    content = SAMPLE_XML.read_bytes()
    invoice_service.create_efatura_draft_from_upload(db_session, entity.id, content)
    with entity_context(db_session, entity.id):
        draft = db_session.scalar(select(InvoiceDraft))
        assert draft is not None
        draft.supplier_id = supplier_id
        draft.status = InvoiceDraftStatus.CONFIRMED
        draft.confirmed_by = ACTOR_ID
        db_session.commit()
        db_session.refresh(draft)
        return supplier_id, draft


def test_supplier_payment_credits_named_bank_sub_account(
    db_session, restaurant_a, seeded_accounts
) -> None:
    bank = service.create_money_account(db_session, restaurant_a.id, _bank_payload())
    supplier_id, draft = _supplier_and_draft(db_session, restaurant_a)

    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        draft.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 2, 1),
        amount_kurus=1_000_000,
        description="Pay Metro",
        actor_id=ACTOR_ID,
        payment_account_id=bank.gl_account_id,
    )

    with entity_context(db_session, restaurant_a.id):
        balance = service.gl_balance_kurus(
            db_session,
            bank.gl_account_id,
            AccountNormalBalance.DEBIT,
        )
        aggregate_lines = db_session.scalar(
            select(func.count())
            .select_from(JournalEntryLine)
            .where(JournalEntryLine.account_id == seeded_accounts["1100"])
        )
    assert balance == -1_000_000
    assert aggregate_lines == 0


def test_aggregate_bucket_still_valid_payment_target(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id, draft = _supplier_and_draft(db_session, restaurant_a)
    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        draft.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )
    payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 2, 1),
        amount_kurus=50_000,
        description="Legacy bucket payment",
        actor_id=ACTOR_ID,
        payment_account_id=seeded_accounts["1100"],
    )
    with entity_context(db_session, restaurant_a.id):
        balance = service.gl_balance_kurus(
            db_session,
            seeded_accounts["1100"],
            AccountNormalBalance.DEBIT,
        )
    assert balance == -50_000


def test_rls_isolation_raw_sql(db_session, restaurant_a, restaurant_b, seeded_accounts) -> None:
    seed_default_chart(db_session, restaurant_b.id)
    created = service.create_money_account(db_session, restaurant_a.id, _bank_payload())

    db_session.execute(
        text("SELECT set_config('app.current_entity_id', :eid, true)"),
        {"eid": str(restaurant_b.id)},
    )
    rows = db_session.execute(
        text("SELECT id FROM money_accounts WHERE id = :mid"),
        {"mid": str(created.id)},
    ).all()
    assert rows == []
