"""Account transfer rich descriptions — write + GL enrichment."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.banking import posting as banking_posting
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import transfers as transfer_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import AccountTransferCreate, MoneyAccountCreate
from app.features.banking.transfer_display_description import (
    build_transfer_display_description,
    compose_transfer_post_description,
    format_transfer_account_label,
)
from app.features.banking.transfer_models import AccountTransfer
from app.features.ledger import service as ledger_service
from app.features.reports.cash_flow import get_cash_flow

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
HELPER = (
    Path(__file__).resolve().parents[1]
    / "app/features/banking/transfer_display_description.py"
)


@pytest.fixture
def xfer_setup(db_session, restaurant_a):
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
            account_kind=MoneyAccountKind.BANK,
            name="Garanti",
            bank_name="Garanti",
        ),
    )
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "bank": bank,
    }


def test_manual_transfer_stores_composed_description(db_session, xfer_setup):
    ctx = xfer_setup
    result = transfer_service.create_account_transfer(
        db_session,
        ctx["entity_id"],
        AccountTransferCreate(
            from_money_account_id=ctx["drawer"].id,
            to_money_account_id=ctx["bank"].id,
            transfer_date=date(2026, 8, 22),
            amount_kurus=150_000,
            description="",
            actor_id=ACTOR_ID,
        ),
    )
    expected = compose_transfer_post_description(
        from_name="Main Drawer",
        from_kind="cash",
        to_name="Garanti",
        to_kind="bank",
    )
    assert result.description == expected
    assert "Main Drawer (cash)" in expected
    assert "Garanti (bank)" in expected
    assert result.amount_kurus == 150_000

    with entity_context(db_session, ctx["entity_id"]):
        je = db_session.get(JournalEntry, result.journal_entry_id)
        assert je is not None
        assert je.description == expected
        lines = list(
            db_session.scalars(
                select(JournalEntryLine).where(
                    JournalEntryLine.journal_entry_id == je.id
                )
            )
        )
        sides = {line.account_id: line.side for line in lines}
        assert sides[ctx["bank"].gl_account_id] == AccountNormalBalance.DEBIT
        assert sides[ctx["drawer"].gl_account_id] == AccountNormalBalance.CREDIT


def test_blank_note_posts_without_em_dash(db_session, xfer_setup):
    ctx = xfer_setup
    result = banking_posting.post_account_transfer(
        db_session,
        ctx["entity_id"],
        from_money_account_id=ctx["drawer"].id,
        to_money_account_id=ctx["bank"].id,
        transfer_date=date(2026, 8, 22),
        amount_kurus=50_000,
        description="Account transfer",
        actor_id=ACTOR_ID,
    )
    assert " — " not in result.account_transfer.description
    assert result.account_transfer.amount_kurus == 50_000


def test_gl_enrichment_for_old_style_transfer_description(db_session, xfer_setup):
    ctx = xfer_setup
    result = banking_posting.post_account_transfer(
        db_session,
        ctx["entity_id"],
        from_money_account_id=ctx["drawer"].id,
        to_money_account_id=ctx["bank"].id,
        transfer_date=date(2026, 8, 22),
        amount_kurus=25_000,
        description="",
        actor_id=ACTOR_ID,
    )
    # Simulate a legacy transfer row that only stored the bare default.
    # JE text is immutable once posted — enrichment rebuilds from the transfer row.
    with entity_context(db_session, ctx["entity_id"]):
        row = db_session.get(AccountTransfer, result.account_transfer.id)
        assert row is not None
        row.description = "Account transfer"
        db_session.commit()
        je_id = result.journal_entry.id

    outs, _ = ledger_service.list_journal_entries(db_session, ctx["entity_id"])
    match = next(o for o in outs if o.id == je_id)
    expected = build_transfer_display_description(
        from_label=format_transfer_account_label("Main Drawer", "cash"),
        to_label=format_transfer_account_label("Garanti", "bank"),
        note=None,
    )
    assert match.description == expected


def test_cash_flow_still_excludes_transfers(db_session, xfer_setup):
    ctx = xfer_setup
    banking_posting.post_account_transfer(
        db_session,
        ctx["entity_id"],
        from_money_account_id=ctx["drawer"].id,
        to_money_account_id=ctx["bank"].id,
        transfer_date=date(2026, 8, 22),
        amount_kurus=10_000,
        description="",
        actor_id=ACTOR_ID,
    )
    report = get_cash_flow(
        db_session,
        ctx["entity_id"],
        from_date=date(2026, 8, 1),
        to_date=date(2026, 8, 31),
    )
    assert "transfer" not in {row.source for row in report.by_source}


def test_mutation_helpers_reject_bare_account_transfer():
    composed = build_transfer_display_description(
        from_label="Main Drawer (cash)",
        to_label="Garanti (bank)",
        note=None,
    )
    assert composed != "Account transfer"
    assert "→" in composed
    assert "build_transfer_display_description" in HELPER.read_text()
