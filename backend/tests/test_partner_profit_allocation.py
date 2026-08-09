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
        netting_as_of=date(2026, 6, 30),
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
            netting_as_of=date(2026, 6, 30),
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
        netting_as_of=date(2026, 6, 30),
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


def test_correct_profit_allocation_updates_partner_totals(
    db_session, three_partner_setup
) -> None:
    """Edit total voids+reposts — unpaid / allocated follow the new amount."""
    entity_id = three_partner_setup["entity_id"]
    partner_id = three_partner_setup["partner_ids"][0]
    accounts = three_partner_setup["accounts"]

    posted = pa.post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 6, 30),
        profit_kurus=41_013_400,  # 410.134,00 ₺ period P&L by mistake
        description="Period P&L by mistake",
        actor_id=ACTOR_ID,
        net_against_drawings=False,
        netting_as_of=date(2026, 6, 30),
    )
    old_id = posted.journal_entry.id
    corrected = pa.correct_profit_allocation(
        db_session,
        entity_id,
        old_id,
        allocation_date=date(2026, 6, 30),
        profit_kurus=40_000_000,  # 400.000,00 ₺
        description="Owner intended amount",
        actor_id=ACTOR_ID,
        net_against_drawings=False,
        netting_as_of=date(2026, 6, 30),
        reason="Amount should be 400k not period P&L",
    )

    assert corrected.journal_entry.id != old_id
    assert _gl_balance(
        db_session, entity_id, accounts[RETAINED_EARNINGS_CODE], AccountNormalBalance.CREDIT
    ) == -40_000_000
    # Ali 50% of 400.000,00 ₺
    assert partner_ledger.profit_allocated_kurus(db_session, entity_id, partner_id) == 20_000_000
    assert partner_ledger.unpaid_profit_kurus(db_session, entity_id, partner_id) == 20_000_000


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
        netting_as_of=date(2026, 6, 30),
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
        netting_as_of=date(2026, 6, 30),
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


def test_profit_allocation_nets_prior_drawing(db_session, three_partner_setup) -> None:
    entity_id = three_partner_setup["entity_id"]
    partner_id = three_partner_setup["partner_ids"][0]
    drawer = three_partner_setup["drawer"]
    accounts = three_partner_setup["accounts"]

    partner_posting.post_drawing(
        db_session,
        entity_id,
        partner_id,
        drawing_date=date(2026, 6, 15),
        amount_kurus=200_000,
        description="Early drawing",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    result = pa.post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 6, 30),
        profit_kurus=1_000_000,
        description="Profit with netting",
        actor_id=ACTOR_ID,
        net_against_drawings=True,
        netting_as_of=date(2026, 6, 30),
    )

    by_partner = {
        e.partner_id: e.amount_kurus
        for e in result.partner_ledger_entries
        if e.movement_type == PartnerMovementType.PROFIT_ALLOCATION
    }
    assert by_partner[partner_id] == 300_000  # 500k gross − 200k already taken
    assert sum(by_partner.values()) == 800_000

    assert _gl_balance(
        db_session, entity_id, accounts[PARTNER_CAPITAL_CODE], AccountNormalBalance.CREDIT
    ) == 800_000

    # "Profit allocated" is the partner's share, not the cash residual. This
    # partner was allocated 500k of the 1.000k profit; 200k of it cleared their
    # drawings and 300k remained. Summing only PROFIT_ALLOCATION reported 300k,
    # making a partner look allocated less than their ownership share.
    assert (
        partner_ledger.profit_allocated_kurus(db_session, entity_id, partner_id)
        == 500_000
    )
    # Unpaid profit is unchanged: the settled 200k is discharged, not owed.
    assert (
        partner_ledger.unpaid_profit_kurus(db_session, entity_id, partner_id)
        == 300_000
    )
    assert _gl_balance(
        db_session, entity_id, accounts[OWNER_DRAWINGS_CODE], AccountNormalBalance.DEBIT
    ) == 0
    assert partner_ledger.net_balance_kurus(db_session, entity_id, partner_id) == 0

    with entity_context(db_session, entity_id):
        types = db_session.scalars(
            select(PartnerLedgerEntry.movement_type).where(
                PartnerLedgerEntry.partner_id == partner_id
            )
        ).all()
    assert PartnerMovementType.PROFIT_SETTLEMENT in types
    assert PartnerMovementType.PROFIT_ALLOCATION in types


def test_profit_paid_from_cash_reduces_drawer_and_unpaid(
    db_session, three_partner_setup
) -> None:
    entity_id = three_partner_setup["entity_id"]
    partner_id = three_partner_setup["partner_ids"][0]
    drawer = three_partner_setup["drawer"]
    accounts = three_partner_setup["accounts"]

    pa.post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 6, 30),
        profit_kurus=1_000_000,
        description="Profit",
        actor_id=ACTOR_ID,
        net_against_drawings=False,
        netting_as_of=date(2026, 6, 30),
    )
    assert partner_ledger.unpaid_profit_kurus(db_session, entity_id, partner_id) == 500_000

    cash_before = _gl_balance(
        db_session, entity_id, drawer.gl_account_id, AccountNormalBalance.DEBIT
    )

    result = partner_posting.post_profit_paid(
        db_session,
        entity_id,
        partner_id,
        payment_date=date(2026, 7, 1),
        amount_kurus=200_000,
        description="Cash profit payout",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    assert result.unpaid_profit_kurus == 300_000
    assert partner_ledger.unpaid_profit_kurus(db_session, entity_id, partner_id) == 300_000
    assert partner_ledger.profit_allocated_kurus(db_session, entity_id, partner_id) == 500_000

    assert (
        _gl_balance(
            db_session, entity_id, drawer.gl_account_id, AccountNormalBalance.DEBIT
        )
        == cash_before - 200_000
    )

    assert _gl_balance(
        db_session, entity_id, accounts[PARTNER_CAPITAL_CODE], AccountNormalBalance.CREDIT
    ) == 1_000_000 - 200_000

    with pytest.raises(partner_ledger.OverProfitPaymentError):
        partner_posting.post_profit_paid(
            db_session,
            entity_id,
            partner_id,
            payment_date=date(2026, 7, 2),
            amount_kurus=400_000,
            description="Too much",
            actor_id=ACTOR_ID,
            payment_account_id=drawer.gl_account_id,
        )


def test_profit_paid_from_bank(db_session, three_partner_setup) -> None:
    entity_id = three_partner_setup["entity_id"]
    partner_id = three_partner_setup["partner_ids"][1]
    accounts = three_partner_setup["accounts"]

    bank = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.BANK, name="Ops Bank"),
    )

    pa.post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 6, 30),
        profit_kurus=1_000_000,
        description="Profit",
        actor_id=ACTOR_ID,
        net_against_drawings=False,
        netting_as_of=date(2026, 6, 30),
    )

    partner_posting.post_profit_paid(
        db_session,
        entity_id,
        partner_id,
        payment_date=date(2026, 7, 1),
        amount_kurus=300_000,
        description="Bank profit payout",
        actor_id=ACTOR_ID,
        payment_account_id=bank.gl_account_id,
    )
    assert partner_ledger.unpaid_profit_kurus(db_session, entity_id, partner_id) == 0
    assert _gl_balance(
        db_session, entity_id, accounts[PARTNER_CAPITAL_CODE], AccountNormalBalance.CREDIT
    ) == 700_000


def test_profit_netting_ignores_drawings_after_period_to(
    db_session, three_partner_setup
) -> None:
    entity_id = three_partner_setup["entity_id"]
    partner_id = three_partner_setup["partner_ids"][0]
    drawer = three_partner_setup["drawer"]
    period_end = date(2026, 6, 30)

    partner_posting.post_drawing(
        db_session,
        entity_id,
        partner_id,
        drawing_date=date(2026, 6, 15),
        amount_kurus=50_000,
        description="In-period drawing",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    partner_posting.post_drawing(
        db_session,
        entity_id,
        partner_id,
        drawing_date=date(2026, 7, 27),
        amount_kurus=200_000,
        description="After-period drawing",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    assert (
        partner_ledger.net_balance_kurus_as_of(
            db_session, entity_id, partner_id, as_of=period_end
        )
        == -50_000
    )

    preview = pa.preview_profit_allocation(
        db_session,
        entity_id,
        profit_kurus=1_000_000,
        net_against_drawings=True,
        netting_as_of=period_end,
    )
    ali = next(s for s in preview.splits if s.partner_id == partner_id)
    assert ali.gross_amount_kurus == 500_000
    assert ali.offset_kurus == 50_000
    assert ali.amount_kurus == 450_000

    pa.post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 7, 31),
        profit_kurus=1_000_000,
        description="Q2 profit",
        actor_id=ACTOR_ID,
        net_against_drawings=True,
        netting_as_of=period_end,
    )

    # In-period drawing settled; after-period drawing still owed.
    assert partner_ledger.net_balance_kurus(db_session, entity_id, partner_id) == -200_000


def test_statement_partner_profit_paid_from_bank(db_session, three_partner_setup) -> None:
    """Bank profit payouts post via statement classify — not a second manual pay."""
    from app.core.onboarding.posting import post_opening_balances
    from app.features.banking import statements as statement_service
    from app.features.banking.statement_models import (
        StatementLineClassification,
        StatementLineStatus,
    )
    from app.features.onboarding.opening_balances import OpeningBalanceLineInput

    entity_id = three_partner_setup["entity_id"]
    partner_id = three_partner_setup["partner_ids"][0]
    accounts = three_partner_setup["accounts"]

    bank = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.BANK, name="Garanti TRY"),
    )
    post_opening_balances(
        db_session,
        entity_id,
        go_live_date=date(2026, 1, 1),
        lines=[OpeningBalanceLineInput(money_account_id=bank.id, amount_kurus=5_000_000)],
        actor_id=ACTOR_ID,
    )

    pa.post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 6, 30),
        profit_kurus=1_000_000,
        description="Profit",
        actor_id=ACTOR_ID,
        net_against_drawings=False,
        netting_as_of=date(2026, 6, 30),
    )
    assert partner_ledger.unpaid_profit_kurus(db_session, entity_id, partner_id) == 500_000

    csv = (
        "transaction_date,amount,description,reference\n"
        '2026-07-01,"-2.000,00",KAR ODEME ORTAK,REF-PP\n'
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="profit-out.csv",
    )
    line_id = statement.lines[0].id

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line_id,
        classification=StatementLineClassification.PARTNER_PROFIT_PAID,
        partner_id=partner_id,
        actor_id=ACTOR_ID,
    )
    assert result.line.status == StatementLineStatus.POSTED
    assert result.journal_entry_id is not None
    assert partner_ledger.unpaid_profit_kurus(db_session, entity_id, partner_id) == 300_000
    assert _gl_balance(
        db_session, entity_id, accounts[PARTNER_CAPITAL_CODE], AccountNormalBalance.CREDIT
    ) == 800_000
    assert _gl_balance(
        db_session, entity_id, bank.gl_account_id, AccountNormalBalance.DEBIT
    ) == 5_000_000 - 200_000


def test_profit_settlement_clears_drawings_net(db_session, three_partner_setup) -> None:
    """Drawing netted by profit allocation reads as repaid — not withdrawn forever.

    Regression (2026-07-13): drawings_net_kurus ignored PROFIT_SETTLEMENT rows,
    so after netting the net balance zeroed but the partner page kept showing
    the withdrawal as outstanding.
    """
    entity_id = three_partner_setup["entity_id"]
    drawer = three_partner_setup["drawer"]
    partner_ids = three_partner_setup["partner_ids"]
    ali = partner_ids[0]  # 50% share

    partner_posting.post_drawing(
        db_session,
        entity_id,
        ali,
        drawing_date=date(2026, 6, 10),
        amount_kurus=100_000,
        description="Cash taken",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    assert partner_ledger.drawings_net_kurus(db_session, entity_id, ali) == -100_000

    pa.post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 6, 30),
        profit_kurus=1_000_000,
        description="H1 profit share",
        actor_id=ACTOR_ID,
        net_against_drawings=True,
        netting_as_of=date(2026, 6, 30),
    )

    # Ali's 500_000 share: 100_000 settles the drawing, 400_000 to capital
    # (capital is permanent equity — excluded from the operational net).
    assert partner_ledger.drawings_net_kurus(db_session, entity_id, ali) == 0
    assert partner_ledger.net_balance_kurus(db_session, entity_id, ali) == 0

    with entity_context(db_session, entity_id):
        settlement = db_session.scalar(
            select(PartnerLedgerEntry).where(
                PartnerLedgerEntry.partner_id == ali,
                PartnerLedgerEntry.movement_type
                == PartnerMovementType.PROFIT_SETTLEMENT,
            )
        )
    assert settlement is not None
    assert settlement.amount_kurus == 100_000


def _capital_gl_balance(db_session, entity_id) -> int:
    """GL 3300, read the way the application reads it.

    Deliberately not the `_gl_balance` helper above: that one sums every line
    on the account, and a hand-rolled balance is how this whole area went
    wrong in the first place. `balance_as_of_kurus` is the function the books
    themselves use, so a test built on it cannot quietly disagree with them.
    """
    from app.core.ledger.balances import balance_as_of_kurus

    with entity_context(db_session, entity_id):
        account = db_session.scalar(
            select(Account).where(Account.code == PARTNER_CAPITAL_CODE)
        )
        return balance_as_of_kurus(db_session, account, date(2030, 1, 1))


def test_the_3300_tie_holds_after_every_partner_movement(
    db_session, three_partner_setup
) -> None:
    """The subledger total must equal GL 3300 no matter what has happened.

    Written after the health report found India Gate's partner subledger
    220.000 ₺ above its own capital account. The books were right; the tie
    was summing allocations and contributions and ignoring profit *paid*, so
    every payment to a partner widened a gap that looked like missing money.

    The earlier tests here each asserted the tie after one kind of movement,
    and every one of them passed — because none of them ever paid a partner.
    So this exercises the lot in sequence: a drawing, an allocation big enough
    to be split into settlement plus residual, a repayment, a contribution,
    and a payment out. Add a movement type that reaches 3300 later and this
    fails, which is the entire point of it.
    """
    entity_id = three_partner_setup["entity_id"]
    partner_id = three_partner_setup["partner_ids"][0]
    drawer = three_partner_setup["drawer"]

    partner_posting.post_drawing(
        db_session, entity_id, partner_id,
        drawing_date=date(2026, 6, 1), amount_kurus=200_000,
        description="Took cash", actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    partner_posting.post_capital_contribution(
        db_session, entity_id, partner_id,
        contribution_date=date(2026, 6, 5), amount_kurus=1_500_000,
        description="Put money in", actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    partner_posting.post_drawing_repayment(
        db_session, entity_id, partner_id,
        payment_date=date(2026, 6, 10), amount_kurus=50_000,
        description="Paid some back", actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    # 50% of 1.000.000 = 500.000 against 150.000 still drawn: settles the
    # 150.000 and leaves 350.000 as the partner's residual capital credit.
    pa.post_profit_allocation(
        db_session, entity_id,
        allocation_date=date(2026, 6, 30), profit_kurus=1_000_000,
        description="H1 profit", actor_id=ACTOR_ID,
        netting_as_of=date(2026, 6, 30),
    )
    partner_posting.post_profit_paid(
        db_session, entity_id, partner_id,
        payment_date=date(2026, 7, 1), amount_kurus=100_000,
        description="Profit share out", actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    with entity_context(db_session, entity_id):
        moved = set(db_session.scalars(select(PartnerLedgerEntry.movement_type)).all())
    assert PartnerMovementType.PROFIT_SETTLEMENT in moved, "no settlement — the split never happened"
    assert PartnerMovementType.PROFIT_PAID in moved, "no payment — the case that broke it"

    subledger = partner_ledger.entity_capital_total_kurus(db_session, entity_id)
    assert subledger == _capital_gl_balance(db_session, entity_id)


def test_a_profit_payment_moves_both_sides_of_the_tie_together(
    db_session, three_partner_setup
) -> None:
    """Narrower: the payment itself, before and after, one movement apart.

    The test above would also pass if two unrelated errors cancelled. This
    pins the actual claim — paying a partner reduces the subledger by exactly
    what it reduces the account by.
    """
    entity_id = three_partner_setup["entity_id"]
    partner_id = three_partner_setup["partner_ids"][0]
    drawer = three_partner_setup["drawer"]

    pa.post_profit_allocation(
        db_session, entity_id,
        allocation_date=date(2026, 6, 30), profit_kurus=1_000_000,
        description="Profit", actor_id=ACTOR_ID,
        netting_as_of=date(2026, 6, 30),
    )
    before_sub = partner_ledger.entity_capital_total_kurus(db_session, entity_id)
    before_gl = _capital_gl_balance(db_session, entity_id)
    assert before_sub == before_gl == 1_000_000

    partner_posting.post_profit_paid(
        db_session, entity_id, partner_id,
        payment_date=date(2026, 7, 1), amount_kurus=300_000,
        description="Paid out", actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    assert _capital_gl_balance(db_session, entity_id) == 700_000
    assert partner_ledger.entity_capital_total_kurus(db_session, entity_id) == 700_000
