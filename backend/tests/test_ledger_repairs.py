"""Ledger repair runner + profit_allocation_v3 void+repost."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.core.auth.dev_actor import ensure_dev_actor_user
from app.core.auth.types import EntityRole
from app.core.chart_of_accounts.default_chart import (
    OWNER_DRAWINGS_CODE,
    PARTNER_CAPITAL_CODE,
    RETAINED_EARNINGS_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource, JournalEntryStatus
from app.core.ledger.posting import PostingLine, prepare_journal_entry
from app.core.ledger.repairs.models import LedgerRepair
from app.core.ledger.repairs.profit_allocation_v3 import (
    REPAIR_KEY,
    UNLOCK_REASON,
    AllocationEra,
    classify_allocation_era,
)
from app.core.ledger.repairs.runner import run_pending_repairs
from app.core.partners import ledger as partner_ledger
from app.core.partners import posting as partner_posting
from app.core.partners import profit_allocation as pa
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.core.period_locks.models import PeriodLockAuditAction, PeriodLockAuditEvent, PeriodLockKind
from app.core.period_locks.service import close_period
from app.core.schema_types import DEV_ACTOR_ID
from app.db.session import entity_context
from app.features.auth import service as auth_service
from app.features.auth.schema import MembershipCreate, UserCreate
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.partners.models import Partner


ACTOR_ID = DEV_ACTOR_ID


@pytest.fixture
def two_partner_setup(db_session, restaurant_a):
    ensure_dev_actor_user(db_session)
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        partners = []
        for name, pct in [("Ali", "60"), ("Burak", "40")]:
            p = Partner(name=name, ownership_share_pct=Decimal(pct))
            db_session.add(p)
            partners.append(p)
        db_session.commit()
        for p in partners:
            db_session.refresh(p)
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "accounts": accounts,
        "partners": partners,
        "partner_ids": [p.id for p in partners],
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


def _post_era_a_no_net(
    db_session,
    entity_id: uuid.UUID,
    *,
    profit_kurus: int,
    allocation_date: date,
) -> JournalEntry:
    """Era A: full Dr 3100 / Cr 3300, drawings not settled."""
    result = pa.post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=allocation_date,
        profit_kurus=profit_kurus,
        description="Era A allocation",
        actor_id=ACTOR_ID,
        net_against_drawings=False,
        netting_as_of=allocation_date,
    )
    return result.journal_entry


def _post_era_b_netted_down(
    db_session,
    entity_id: uuid.UUID,
    *,
    profit_kurus: int,
    allocation_date: date,
    actor_id: uuid.UUID = ACTOR_ID,
) -> JournalEntry:
    """Simulate era B: residual capital only — no Cr 3200 / PROFIT_SETTLEMENT."""
    with entity_context(db_session, entity_id):
        partners = pa._active_partners_with_shares(db_session)
        nets = {
            p.id: partner_ledger.net_balance_kurus_as_of(
                db_session, entity_id, p.id, as_of=allocation_date
            )
            for p in partners
        }
        splits = pa.split_profit_by_ownership(
            profit_kurus,
            partners,
            net_balances=nets,
            net_against_drawings=True,
        )
        retained = db_session.scalar(select(Account).where(Account.code == RETAINED_EARNINGS_CODE))
        capital = db_session.scalar(select(Account).where(Account.code == PARTNER_CAPITAL_CODE))
        assert retained is not None and capital is not None
        residual = sum(s.amount_kurus for s in splits)
        assert residual > 0
        lines = [
            PostingLine(
                account_id=retained.id,
                amount_kurus=residual,
                side=AccountNormalBalance.DEBIT,
            )
        ]
        for split in splits:
            if split.amount_kurus <= 0:
                continue
            lines.append(
                PostingLine(
                    account_id=capital.id,
                    amount_kurus=split.amount_kurus,
                    side=AccountNormalBalance.CREDIT,
                )
            )
        entry = prepare_journal_entry(
            db_session,
            entity_id,
            allocation_date,
            "Era B residual allocation",
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.PARTNER_PROFIT_ALLOCATION,
        )
        for split in splits:
            if split.amount_kurus <= 0:
                continue
            partner_ledger.persist_partner_ledger_entry(
                db_session,
                split.partner_id,
                movement_date=allocation_date,
                movement_type=PartnerMovementType.PROFIT_ALLOCATION,
                amount_kurus=split.amount_kurus,
                description="Era B residual allocation",
                actor_id=actor_id,
                journal_entry_id=entry.id,
            )
        db_session.commit()
        db_session.refresh(entry)
        _ = list(entry.lines)
        return entry


def test_runner_idempotent_second_run_noop(db_session, two_partner_setup) -> None:
    entity_id = two_partner_setup["entity_id"]
    _post_era_a_no_net(
        db_session, entity_id, profit_kurus=1_000_000, allocation_date=date(2026, 6, 30)
    )

    first = run_pending_repairs(db_session, entity_id=entity_id)
    assert len(first) == 1
    assert not first[0].skipped
    assert len(first[0].details["repaired"]) == 1

    second = run_pending_repairs(db_session, entity_id=entity_id)
    assert len(second) == 1
    assert second[0].skipped
    assert second[0].details["reason"] == "already_applied"

    with entity_context(db_session, entity_id):
        rows = list(db_session.scalars(select(LedgerRepair)))
    assert len(rows) == 1
    assert rows[0].repair_key == REPAIR_KEY


def test_era_a_with_drawings_repairs_to_settlement(db_session, two_partner_setup) -> None:
    entity_id = two_partner_setup["entity_id"]
    ali_id = two_partner_setup["partner_ids"][0]
    drawer = two_partner_setup["drawer"]
    accounts = two_partner_setup["accounts"]

    partner_posting.post_drawing(
        db_session,
        entity_id,
        ali_id,
        drawing_date=date(2026, 6, 10),
        amount_kurus=200_000,
        description="Pre-alloc drawing",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    old = _post_era_a_no_net(
        db_session, entity_id, profit_kurus=1_000_000, allocation_date=date(2026, 6, 30)
    )
    with entity_context(db_session, entity_id):
        era = classify_allocation_era(
            db_session, entity_id, old, accounts=accounts
        )
    assert era == AllocationEra.A

    reports = run_pending_repairs(db_session, entity_id=entity_id)
    assert len(reports[0].details["repaired"]) == 1

    assert _gl_balance(
        db_session, entity_id, accounts[RETAINED_EARNINGS_CODE], AccountNormalBalance.CREDIT
    ) == -1_000_000  # Dr 3100 gross on repair (+ void reversal nets with old)
    # After void+repost: drawings credited via settlement and capital reduced
    assert _gl_balance(
        db_session, entity_id, accounts[OWNER_DRAWINGS_CODE], AccountNormalBalance.DEBIT
    ) == 0
    assert partner_ledger.net_balance_kurus(db_session, entity_id, ali_id) == 0
    assert partner_ledger.unpaid_profit_kurus(db_session, entity_id, ali_id) == 400_000

    with entity_context(db_session, entity_id):
        posted = list(
            db_session.scalars(
                select(JournalEntry).where(
                    JournalEntry.source == JournalEntrySource.PARTNER_PROFIT_ALLOCATION,
                    JournalEntry.status == JournalEntryStatus.POSTED,
                )
            )
        )
        assert len(posted) == 1
        types = set(
            db_session.scalars(
                select(PartnerLedgerEntry.movement_type).where(
                    PartnerLedgerEntry.journal_entry_id == posted[0].id
                )
            )
        )
    assert PartnerMovementType.PROFIT_SETTLEMENT in types
    assert PartnerMovementType.PROFIT_ALLOCATION in types


def test_era_b_residual_repairs_to_gross_and_settlement(
    db_session, two_partner_setup
) -> None:
    entity_id = two_partner_setup["entity_id"]
    ali_id = two_partner_setup["partner_ids"][0]
    drawer = two_partner_setup["drawer"]
    accounts = two_partner_setup["accounts"]

    partner_posting.post_drawing(
        db_session,
        entity_id,
        ali_id,
        drawing_date=date(2026, 6, 10),
        amount_kurus=200_000,
        description="Pre-alloc drawing",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    old = _post_era_b_netted_down(
        db_session,
        entity_id,
        profit_kurus=1_000_000,
        allocation_date=date(2026, 6, 30),
    )
    with entity_context(db_session, entity_id):
        era = classify_allocation_era(
            db_session, entity_id, old, accounts=accounts
        )
    assert era == AllocationEra.B
    # Era B left drawings open and only residual on 3100
    assert _gl_balance(
        db_session, entity_id, accounts[RETAINED_EARNINGS_CODE], AccountNormalBalance.CREDIT
    ) == -800_000
    assert partner_ledger.net_balance_kurus(db_session, entity_id, ali_id) == -200_000

    reports = run_pending_repairs(db_session, entity_id=entity_id)
    repaired = reports[0].details["repaired"]
    assert len(repaired) == 1
    assert repaired[0]["era"] == "b"
    assert repaired[0]["profit_kurus"] == 1_000_000

    assert _gl_balance(
        db_session, entity_id, accounts[OWNER_DRAWINGS_CODE], AccountNormalBalance.DEBIT
    ) == 0
    assert partner_ledger.net_balance_kurus(db_session, entity_id, ali_id) == 0
    assert partner_ledger.capital_balance_kurus(db_session, entity_id, ali_id) == 400_000
    assert partner_ledger.unpaid_profit_kurus(db_session, entity_id, ali_id) == 400_000

    with entity_context(db_session, entity_id):
        posted = db_session.scalar(
            select(JournalEntry).where(
                JournalEntry.source == JournalEntrySource.PARTNER_PROFIT_ALLOCATION,
                JournalEntry.status == JournalEntryStatus.POSTED,
            )
        )
        assert posted is not None
        debit_3100 = sum(
            line.amount_kurus
            for line in posted.lines
            if line.account_id == accounts[RETAINED_EARNINGS_CODE]
            and line.side == AccountNormalBalance.DEBIT
        )
        credit_3200 = sum(
            line.amount_kurus
            for line in posted.lines
            if line.account_id == accounts[OWNER_DRAWINGS_CODE]
            and line.side == AccountNormalBalance.CREDIT
        )
    assert debit_3100 == 1_000_000
    assert credit_3200 == 200_000


def test_current_era_c_skipped(db_session, two_partner_setup) -> None:
    entity_id = two_partner_setup["entity_id"]
    ali_id = two_partner_setup["partner_ids"][0]
    drawer = two_partner_setup["drawer"]

    partner_posting.post_drawing(
        db_session,
        entity_id,
        ali_id,
        drawing_date=date(2026, 6, 10),
        amount_kurus=50_000,
        description="Drawing to force settlement shape",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    pa.post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 6, 30),
        profit_kurus=500_000,
        description="Already current",
        actor_id=ACTOR_ID,
        net_against_drawings=True,
        netting_as_of=date(2026, 6, 30),
    )
    reports = run_pending_repairs(db_session, entity_id=entity_id)
    assert reports[0].details["skipped_current"] == 1
    assert reports[0].details["repaired"] == []


def test_soft_locked_month_repairs_with_unlock_reason(
    db_session, two_partner_setup
) -> None:
    entity_id = two_partner_setup["entity_id"]
    owner = auth_service.create_user(
        db_session, UserCreate(email="owner-repair@example.com", display_name="Owner")
    )
    auth_service.add_entity_member(
        db_session,
        entity_id,
        MembershipCreate(user_id=owner.id, role=EntityRole.OWNER),
    )

    _post_era_a_no_net(
        db_session, entity_id, profit_kurus=100_000, allocation_date=date(2026, 5, 15)
    )
    close_period(
        db_session,
        entity_id,
        lock_kind=PeriodLockKind.MONTH,
        anchor_date=date(2026, 5, 15),
        actor_id=owner.id,
        reason="Close May for repair test",
    )

    reports = run_pending_repairs(db_session, entity_id=entity_id)
    assert len(reports[0].details["repaired"]) == 1
    assert reports[0].details["actor_id"] == str(owner.id)

    with entity_context(db_session, entity_id):
        unlocks = list(
            db_session.scalars(
                select(PeriodLockAuditEvent).where(
                    PeriodLockAuditEvent.action == PeriodLockAuditAction.UNLOCK_WRITE
                )
            )
        )
    assert unlocks
    assert any(UNLOCK_REASON in (e.reason or "") for e in unlocks)
