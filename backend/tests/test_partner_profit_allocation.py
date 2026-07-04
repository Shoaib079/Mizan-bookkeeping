"""Partner profit allocation — ownership split, GL, void, entity isolation."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    OWNER_DRAWINGS_CODE,
    PARTNER_CAPITAL_CODE,
    PARTNER_REIMBURSEMENT_PAYABLE_CODE,
    RETAINED_EARNINGS_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntryLine, JournalEntrySource
from app.core.partners import ledger as partner_ledger
from app.core.partners import posting as partner_posting
from app.core.partners import profit_allocation as pa
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.profit_allocation import OwnershipShareError
from app.core.partners.types import PartnerMovementType
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.partners.models import Partner


ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def three_partner_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        partners = []
        for name, pct in [("Ali", "50"), ("Burak", "30"), ("Cem", "20")]:
            p = Partner(name=name, ownership_share_pct=Decimal(pct))
            db_session.add(p)
            partners.append(p)
        db_session.commit()
        for p in partners:
            db_session.refresh(p)
        partner_ids = [p.id for p in partners]
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "accounts": accounts,
        "partners": partners,
        "partner_ids": partner_ids,
    }


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


def test_three_partner_split_posts_exact_credits(db_session, three_partner_setup) -> None:
    entity_id = three_partner_setup["entity_id"]
    accounts = three_partner_setup["accounts"]
    partners = three_partner_setup["partners"]
    partner_ids = three_partner_setup["partner_ids"]
    total = 1_000_001  # odd total — last partner absorbs remainder

    result = pa.post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 6, 30),
        profit_kurus=total,
        description="H1 profit share",
        actor_id=ACTOR_ID,
    )

    assert result.journal_entry.source == JournalEntrySource.PARTNER_PROFIT_ALLOCATION
    assert len(result.partner_ledger_entries) == 3

    by_partner = {e.partner_id: e.amount_kurus for e in result.partner_ledger_entries}
    assert by_partner[partner_ids[0]] == 500_000
    assert by_partner[partner_ids[1]] == 300_000
    assert by_partner[partner_ids[2]] == 200_001
    assert sum(by_partner.values()) == total

    assert _gl_balance(
        db_session, entity_id, accounts[RETAINED_EARNINGS_CODE], AccountNormalBalance.CREDIT
    ) == -total
    assert _gl_balance(
        db_session, entity_id, accounts[PARTNER_CAPITAL_CODE], AccountNormalBalance.CREDIT
    ) == total

    subledger_capital = partner_ledger.entity_capital_total_kurus(db_session, entity_id)
    assert subledger_capital == total


def test_shares_not_100_rejected(db_session, three_partner_setup) -> None:
    entity_id = three_partner_setup["entity_id"]
    with entity_context(db_session, entity_id):
        three_partner_setup["partners"][2].ownership_share_pct = Decimal("19")
        db_session.commit()

    with pytest.raises(OwnershipShareError, match="100%"):
        pa.post_profit_allocation(
            db_session,
            entity_id,
            allocation_date=date(2026, 6, 30),
            profit_kurus=100_000,
            description="Bad shares",
            actor_id=ACTOR_ID,
        )


def test_void_reverses_cleanly(db_session, three_partner_setup) -> None:
    entity_id = three_partner_setup["entity_id"]
    accounts = three_partner_setup["accounts"]

    posted = pa.post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 6, 30),
        profit_kurus=300_000,
        description="To void",
        actor_id=ACTOR_ID,
    )
    pa.void_profit_allocation(
        db_session,
        entity_id,
        posted.journal_entry.id,
        actor_id=ACTOR_ID,
        reason="Owner correction",
    )

    assert _gl_balance(
        db_session, entity_id, accounts[PARTNER_CAPITAL_CODE], AccountNormalBalance.CREDIT
    ) == 0
    assert partner_ledger.entity_capital_total_kurus(db_session, entity_id) == 0


def test_entity_a_allocation_invisible_to_entity_b(
    db_session, restaurant_a, restaurant_b, three_partner_setup
) -> None:
    entity_a = three_partner_setup["entity_id"]
    seed_default_chart(db_session, restaurant_b.id)

    pa.post_profit_allocation(
        db_session,
        entity_a,
        allocation_date=date(2026, 6, 30),
        profit_kurus=100_000,
        description="Entity A only",
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, restaurant_b.id):
        gl_capital = db_session.scalar(
            select(Account.id).where(Account.code == PARTNER_CAPITAL_CODE)
        )
    assert gl_capital is not None
    assert _gl_balance(db_session, restaurant_b.id, gl_capital, AccountNormalBalance.CREDIT) == 0
    assert partner_ledger.entity_capital_total_kurus(db_session, restaurant_b.id) == 0


def test_capital_balance_allocation_minus_drawings(db_session, three_partner_setup) -> None:
    entity_id = three_partner_setup["entity_id"]
    partner_id = three_partner_setup["partner_ids"][0]
    drawer = three_partner_setup["drawer"]

    pa.post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 6, 30),
        profit_kurus=1_000_000,
        description="Profit",
        actor_id=ACTOR_ID,
    )

    partner_posting.post_drawing(
        db_session,
        entity_id,
        partner_id,
        drawing_date=date(2026, 7, 1),
        amount_kurus=200_000,
        description="Drawing",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    capital = partner_ledger.capital_balance_kurus(db_session, entity_id, partner_id)
    assert capital == 500_000 - 200_000
    reimbursement = partner_ledger.reimbursement_balance_kurus(
        db_session, entity_id, partner_id
    )
    assert reimbursement == 0

    with entity_context(db_session, entity_id):
        types = db_session.scalars(
            select(PartnerLedgerEntry.movement_type).where(
                PartnerLedgerEntry.partner_id == partner_id
            )
        ).all()
    assert PartnerMovementType.PROFIT_ALLOCATION in types
    assert PartnerMovementType.DRAWING in types

    accounts = three_partner_setup["accounts"]
    assert _gl_balance(
        db_session, entity_id, accounts[OWNER_DRAWINGS_CODE], AccountNormalBalance.DEBIT
    ) == 200_000
    assert _gl_balance(
        db_session, entity_id, accounts[PARTNER_REIMBURSEMENT_PAYABLE_CODE], AccountNormalBalance.CREDIT
    ) == 0
