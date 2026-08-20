"""Guard 2 — voided / superseded rows never move any published total.

Sweeps every public balance/total helper (staff, partner, supplier, customer,
FX, payables, receivables, hubs/dashboard, GL as-of). Plant a voided entry and
assert the published figure is unchanged. Opposite-direction case: a LIVE row
does move the figure (AGENT_GUARDRAILS §3.1 / §3.6).
"""

from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.fx import ledger as fx_ledger
from app.core.fx import posting as fx_posting
from app.core.ledger.balances import balance_as_of_kurus
from app.core.ledger.correction import void_fx_purchase, void_gl_with_subledger_rows
from app.core.ledger.correction.partners import void_partner_journal_entry
from app.core.ledger.subledger_display import SubledgerDisplayKind
from app.core.partners import ledger as partner_ledger
from app.core.partners import posting as partner_posting
from app.core.payables import ledger as payables_ledger
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.core.receivables import ledger as receivables_ledger
from app.core.receivables import posting as receivables_posting
from app.core.staff import ledger as staff_ledger
from app.core.staff import posting as staff_posting
from app.core.staff.types import PayCurrency, StaffMovementType
from app.core.subledger.control_account_tie import (
    customer_subledger_total,
    supplier_subledger_total,
)
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.customers.models import Customer
from app.features.customers.service import void_credit_sale_entry
from app.features.dashboard import service as dashboard_service
from app.features.expenses.schema import ExpenseCreate
from app.features.expenses.service import create_expense, void_expense_by_id
from app.features.partners.models import Partner
from app.features.payables import service as payables_service
from app.features.receivables import service as receivables_service
from app.features.staff.models import Employee
from app.features.staff.service import get_staff_ledger, void_staff_journal_entry_http
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate

from tests.test_staff import ACTOR_ID, staff_setup

#: Names exercised by the sweep — must stay non-empty (guard the guard).
PUBLIC_TOTAL_HELPERS: tuple[str, ...] = (
    "staff.current_balance_minor",
    "staff.outstanding_advance_minor",
    "partner.net_balance_kurus",
    "partner.reimbursement_balance_kurus",
    "partner.entity_total_balance_kurus",
    "supplier.current_balance_kurus",
    "supplier.subledger_total",
    "payables.list_total",
    "customer.current_balance_kurus",
    "customer.entity_total_balance_kurus",
    "customer.subledger_total",
    "receivables.list_total",
    "fx.native_quantity_balance",
    "fx.try_cost_balance_kurus",
    "dashboard.total_payables_kurus",
    "dashboard.total_receivables_kurus",
    "dashboard.total_try_position_kurus",
    "banking.gl_balance_kurus",
    "epochs.balance_as_of_kurus",
)


@pytest.fixture
def totals_sweep_setup(db_session, restaurant_a):
    """One entity with staff, partner, supplier, customer, FX, drawer."""
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    usd_wallet = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.FOREIGN_CURRENCY,
            currency="USD",
            name="USD Wallet",
        ),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        employee = Employee(name="Sweep Staff", pay_currency=PayCurrency.TRY)
        partner = Partner(name="Sweep Partner")
        customer = Customer(name="Sweep Customer")
        db_session.add_all([employee, partner, customer])
        db_session.commit()
        db_session.refresh(employee)
        db_session.refresh(partner)
        db_session.refresh(customer)
        employee_id = employee.id
        partner_id = partner.id
        customer_id = customer.id
    supplier = supplier_service.create_supplier(
        db_session,
        restaurant_a.id,
        SupplierCreate(name="Sweep Supplier", vkn="9988776655"),
    )
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "usd_wallet": usd_wallet,
        "accounts": accounts,
        "employee_id": employee_id,
        "partner_id": partner_id,
        "customer_id": customer_id,
        "supplier_id": supplier.id,
    }


def test_public_total_helper_sweep_is_not_empty() -> None:
    assert len(PUBLIC_TOTAL_HELPERS) >= 15
    assert "staff.current_balance_minor" in PUBLIC_TOTAL_HELPERS
    assert "dashboard.total_payables_kurus" in PUBLIC_TOTAL_HELPERS
    assert "epochs.balance_as_of_kurus" in PUBLIC_TOTAL_HELPERS


def test_void_staff_accrual_excluded_from_balance(db_session, staff_setup) -> None:
    """Voided accrual must not inflate staff balance — use effective rows only."""
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]

    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 5, 5),
        amount_minor=3_400_000,
        description="Salary 2026-04",
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=4,
    )
    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 7, 6),
        amount_minor=3_600_000,
        description="Salary 2026-04",
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=4,
    )

    assert staff_ledger.current_balance_minor(db_session, entity_id, employee_id) == 7_000_000

    with entity_context(db_session, entity_id):
        from app.core.staff.ledger import list_ledger_entries

        rows = list_ledger_entries(db_session, entity_id, employee_id)
        second = next(row for row in rows if row.amount_minor == 3_600_000)
        assert second.journal_entry_id is not None

    void_staff_journal_entry_http(
        db_session,
        entity_id,
        employee_id,
        second.journal_entry_id,
        actor_id=ACTOR_ID,
        reason="Duplicate accrual",
    )

    assert staff_ledger.current_balance_minor(db_session, entity_id, employee_id) == 3_400_000

    ledger = get_staff_ledger(db_session, entity_id, employee_id)
    assert ledger.balance_minor == 3_400_000
    effective_accruals = [
        entry
        for entry in ledger.entries
        if entry.movement_type == StaffMovementType.SALARY_ACCRUED
        and entry.display_kind == SubledgerDisplayKind.EFFECTIVE
    ]
    assert len(effective_accruals) == 1
    assert effective_accruals[0].amount_minor == 3_400_000

    superseded = [
        entry
        for entry in ledger.entries
        if entry.movement_type == StaffMovementType.SALARY_ACCRUED
        and entry.display_kind == SubledgerDisplayKind.SUPERSEDED
    ]
    assert len(superseded) == 1
    assert superseded[0].amount_minor == 3_600_000


def test_voided_rows_never_move_public_totals(db_session, totals_sweep_setup) -> None:
    """Sweep: baseline → post → void → published figure equals baseline."""
    ctx = totals_sweep_setup
    entity_id = ctx["entity_id"]
    drawer = ctx["drawer"]
    accounts = ctx["accounts"]
    seen: list[str] = []

    # --- staff ---
    employee_id = ctx["employee_id"]
    before = staff_ledger.current_balance_minor(db_session, entity_id, employee_id)
    posted = staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 6, 1),
        amount_minor=500_000,
        description="Sweep accrual",
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=6,
    )
    assert staff_ledger.current_balance_minor(db_session, entity_id, employee_id) != before
    void_staff_journal_entry_http(
        db_session,
        entity_id,
        employee_id,
        posted.journal_entry.id,
        actor_id=ACTOR_ID,
        reason="sweep",
    )
    assert staff_ledger.current_balance_minor(db_session, entity_id, employee_id) == before
    seen.append("staff.current_balance_minor")

    before_adv = None
    with entity_context(db_session, entity_id):
        before_adv = staff_ledger.outstanding_advance_minor(db_session, employee_id)
    adv = staff_posting.post_advance_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 2),
        amount_minor=100_000,
        description="Sweep advance",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    with entity_context(db_session, entity_id):
        assert staff_ledger.outstanding_advance_minor(db_session, employee_id) != before_adv
    void_staff_journal_entry_http(
        db_session,
        entity_id,
        employee_id,
        adv.journal_entry.id,
        actor_id=ACTOR_ID,
        reason="sweep",
    )
    with entity_context(db_session, entity_id):
        assert staff_ledger.outstanding_advance_minor(db_session, employee_id) == before_adv
    seen.append("staff.outstanding_advance_minor")

    # --- partner ---
    partner_id = ctx["partner_id"]
    before_net = partner_ledger.net_balance_kurus(db_session, entity_id, partner_id)
    before_reimb = partner_ledger.reimbursement_balance_kurus(
        db_session, entity_id, partner_id
    )
    before_entity = partner_ledger.entity_total_balance_kurus(db_session, entity_id)
    fronted = partner_posting.post_expense_fronted(
        db_session,
        entity_id,
        partner_id,
        expense_date=date(2026, 6, 3),
        amount_kurus=75_000,
        description="Sweep fronted",
        actor_id=ACTOR_ID,
        expense_account_id=accounts["5000"],
    )
    assert partner_ledger.net_balance_kurus(db_session, entity_id, partner_id) != before_net
    void_partner_journal_entry(
        db_session,
        entity_id,
        fronted.journal_entry.id,
        actor_id=ACTOR_ID,
        reason="sweep",
    )
    assert partner_ledger.net_balance_kurus(db_session, entity_id, partner_id) == before_net
    assert (
        partner_ledger.reimbursement_balance_kurus(db_session, entity_id, partner_id)
        == before_reimb
    )
    assert partner_ledger.entity_total_balance_kurus(db_session, entity_id) == before_entity
    seen.extend(
        [
            "partner.net_balance_kurus",
            "partner.reimbursement_balance_kurus",
            "partner.entity_total_balance_kurus",
        ]
    )

    # --- supplier / payables ---
    # list_payables sums every subledger amount (not effective-only), so a void
    # must plant a reversing row — void_gl_with_subledger_rows, not raw GL void.
    supplier_id = ctx["supplier_id"]
    before_sup = payables_ledger.current_balance_kurus(db_session, entity_id, supplier_id)
    before_sub = supplier_subledger_total(db_session, entity_id)
    before_pay_list, _, _ = payables_service.list_payables(db_session, entity_id)
    movement = payables_service.record_movement(
        db_session,
        entity_id,
        supplier_id,
        movement_date=date(2026, 6, 4),
        movement_type=SupplierMovementType.ADJUSTMENT,
        amount_kurus=200_000,
        description="Sweep payable",
        actor_id=ACTOR_ID,
    )
    assert movement.journal_entry_id is not None
    assert (
        payables_ledger.current_balance_kurus(db_session, entity_id, supplier_id)
        != before_sup
    )
    with entity_context(db_session, entity_id):
        row = db_session.scalar(
            select(SupplierLedgerEntry).where(
                SupplierLedgerEntry.journal_entry_id == movement.journal_entry_id
            )
        )
    assert row is not None
    void_gl_with_subledger_rows(
        db_session,
        entity_id,
        movement.journal_entry_id,
        actor_id=ACTOR_ID,
        reason="sweep",
        supplier_row=row,
    )
    assert (
        payables_ledger.current_balance_kurus(db_session, entity_id, supplier_id)
        == before_sup
    )
    assert supplier_subledger_total(db_session, entity_id) == before_sub
    after_pay_list, _, _ = payables_service.list_payables(db_session, entity_id)
    assert after_pay_list == before_pay_list
    seen.extend(
        [
            "supplier.current_balance_kurus",
            "supplier.subledger_total",
            "payables.list_total",
        ]
    )

    # --- customer / receivables ---
    customer_id = ctx["customer_id"]
    revenue_id = accounts[SALES_REVENUE_CODE]
    before_cust = receivables_ledger.current_balance_kurus(
        db_session, entity_id, customer_id
    )
    before_ar_entity = receivables_ledger.entity_total_balance_kurus(db_session, entity_id)
    before_cust_sub = customer_subledger_total(db_session, entity_id)
    before_ar_list, _, _ = receivables_service.list_receivables(db_session, entity_id)
    sale = receivables_posting.post_credit_sale(
        db_session,
        entity_id,
        customer_id,
        sale_date=date(2026, 6, 5),
        amount_kurus=80_000,
        description="Sweep sale",
        actor_id=ACTOR_ID,
        revenue_account_id=revenue_id,
    )
    assert (
        receivables_ledger.current_balance_kurus(db_session, entity_id, customer_id)
        != before_cust
    )
    void_credit_sale_entry(
        db_session,
        entity_id,
        customer_id,
        sale.journal_entry.id,
        actor_id=ACTOR_ID,
        reason="sweep",
    )
    assert (
        receivables_ledger.current_balance_kurus(db_session, entity_id, customer_id)
        == before_cust
    )
    assert (
        receivables_ledger.entity_total_balance_kurus(db_session, entity_id)
        == before_ar_entity
    )
    assert customer_subledger_total(db_session, entity_id) == before_cust_sub
    after_ar_list, _, _ = receivables_service.list_receivables(db_session, entity_id)
    assert after_ar_list == before_ar_list
    seen.extend(
        [
            "customer.current_balance_kurus",
            "customer.entity_total_balance_kurus",
            "customer.subledger_total",
            "receivables.list_total",
        ]
    )

    # --- FX ---
    wallet = ctx["usd_wallet"]
    before_qty = fx_ledger.native_quantity_balance(db_session, entity_id, wallet.id)
    before_try = fx_ledger.try_cost_balance_kurus(db_session, entity_id, wallet.id)
    purchase = fx_posting.post_fx_purchase(
        db_session,
        entity_id,
        fx_money_account_id=wallet.id,
        try_cash_money_account_id=drawer.id,
        native_quantity=100_00,
        try_cost_kurus=3_000_000,
        purchase_date=date(2026, 6, 6),
        description="Sweep FX",
        actor_id=ACTOR_ID,
    )
    assert (
        fx_ledger.native_quantity_balance(db_session, entity_id, wallet.id) != before_qty
    )
    void_fx_purchase(
        db_session,
        entity_id,
        purchase.journal_entry.id,
        actor_id=ACTOR_ID,
        reason="sweep",
    )
    assert (
        fx_ledger.native_quantity_balance(db_session, entity_id, wallet.id) == before_qty
    )
    assert (
        fx_ledger.try_cost_balance_kurus(db_session, entity_id, wallet.id) == before_try
    )
    seen.extend(["fx.native_quantity_balance", "fx.try_cost_balance_kurus"])

    # --- dashboard + banking GL + as-of ---
    dash_before = dashboard_service.get_dashboard(
        db_session, entity_id, from_date=date(2026, 1, 1), to_date=date(2026, 12, 31)
    )
    before_try_pos = dash_before.total_try_position_kurus
    before_payables_hub = dash_before.total_payables_kurus
    before_receivables_hub = dash_before.total_receivables_kurus
    with entity_context(db_session, entity_id):
        before_gl = banking_service.gl_balance_kurus(
            db_session, drawer.gl_account_id, AccountNormalBalance.DEBIT
        )
        drawer_gl = db_session.get(Account, drawer.gl_account_id)
        assert drawer_gl is not None
        before_as_of = balance_as_of_kurus(
            db_session, drawer_gl, as_of_date=date(2026, 12, 31)
        )

    rent_id = accounts.get("5210") or accounts["5200"]
    created = create_expense(
        db_session,
        entity_id,
        ExpenseCreate(
            expense_date=date(2026, 6, 7),
            amount_kurus=25_000,
            expense_account_id=rent_id,
            money_account_id=drawer.id,
            description="Sweep expense",
            actor_id=ACTOR_ID,
            has_source_document=False,
        ),
    )
    with entity_context(db_session, entity_id):
        mid_gl = banking_service.gl_balance_kurus(
            db_session, drawer.gl_account_id, AccountNormalBalance.DEBIT
        )
    assert mid_gl != before_gl
    void_expense_by_id(
        db_session, entity_id, created.id, actor_id=ACTOR_ID, reason="sweep"
    )
    with entity_context(db_session, entity_id):
        assert (
            banking_service.gl_balance_kurus(
                db_session, drawer.gl_account_id, AccountNormalBalance.DEBIT
            )
            == before_gl
        )
        drawer_gl = db_session.get(Account, drawer.gl_account_id)
        assert drawer_gl is not None
        assert (
            balance_as_of_kurus(
                db_session, drawer_gl, as_of_date=date(2026, 12, 31)
            )
            == before_as_of
        )
    dash_after = dashboard_service.get_dashboard(
        db_session, entity_id, from_date=date(2026, 1, 1), to_date=date(2026, 12, 31)
    )
    assert dash_after.total_try_position_kurus == before_try_pos
    assert dash_after.total_payables_kurus == before_payables_hub
    assert dash_after.total_receivables_kurus == before_receivables_hub
    seen.extend(
        [
            "dashboard.total_payables_kurus",
            "dashboard.total_receivables_kurus",
            "dashboard.total_try_position_kurus",
            "banking.gl_balance_kurus",
            "epochs.balance_as_of_kurus",
        ]
    )

    missing = sorted(set(PUBLIC_TOTAL_HELPERS) - set(seen))
    assert not missing, f"sweep skipped helpers: {missing}"
    assert set(seen) == set(PUBLIC_TOTAL_HELPERS)


def test_live_rows_do_move_public_totals(db_session, staff_setup) -> None:
    """Opposite direction — a LIVE accrual must change the published balance."""
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    before = staff_ledger.current_balance_minor(db_session, entity_id, employee_id)
    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 9, 1),
        amount_minor=111_000,
        description="Live must move",
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=9,
    )
    after = staff_ledger.current_balance_minor(db_session, entity_id, employee_id)
    assert after == before + 111_000
