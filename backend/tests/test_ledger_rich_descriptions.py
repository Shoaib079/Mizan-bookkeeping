"""Staff / FX / partner rich ledger descriptions — write + read enrichment."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.fx import posting as fx_posting
from app.core.fx import spend_posting as fx_spend
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.types import PayCurrency
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.fx.ledger_display_description import (
    build_fx_purchase_description,
    build_fx_conversion_description,
    build_fx_spend_description,
)
from app.features.ledger import service as ledger_service
from app.features.partners import service as partner_service
from app.features.partners.ledger_display_description import (
    build_partner_ledger_display_description,
)
from app.features.partners.models import Partner
from app.features.partners.schema import DrawingCreate
from app.features.staff import service as staff_service
from app.features.staff.ledger_display_description import (
    build_staff_ledger_display_description,
    compose_staff_post_description,
)
from app.features.staff.models import Employee
from app.features.staff.schema import (
    StaffAccrualCreate,
    StaffPaymentCreate,
)

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")

STAFF_HELPER = (
    Path(__file__).resolve().parents[1]
    / "app/features/staff/ledger_display_description.py"
)
FX_HELPER = (
    Path(__file__).resolve().parents[1]
    / "app/features/fx/ledger_display_description.py"
)
PARTNER_HELPER = (
    Path(__file__).resolve().parents[1]
    / "app/features/partners/ledger_display_description.py"
)


@pytest.fixture
def rich_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    usd = banking_service.create_money_account(
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
        employee = Employee(name="Ali Veli", pay_currency=PayCurrency.TRY)
        partner = Partner(name="Mehmet Partner")
        db_session.add_all([employee, partner])
        db_session.commit()
        db_session.refresh(employee)
        db_session.refresh(partner)
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "usd": usd,
        "accounts": accounts,
        "employee_id": employee.id,
        "employee_name": employee.name,
        "partner_id": partner.id,
        "partner_name": partner.name,
    }


def test_staff_accrual_and_payment_store_composed_text(db_session, rich_setup):
    ctx = rich_setup
    accrual = staff_service.record_accrual(
        db_session,
        ctx["entity_id"],
        ctx["employee_id"],
        StaffAccrualCreate(
            accrual_date=date(2026, 8, 1),
            amount_minor=100_000,
            description=None,
            actor_id=ACTOR_ID,
            period_year=2026,
            period_month=8,
        ),
    )
    expected_accrual = compose_staff_post_description(
        movement_type="salary_accrued",
        employee_name=ctx["employee_name"],
        period_year=2026,
        period_month=8,
    )
    assert accrual.staff_ledger_entry.description == expected_accrual
    assert "Ali Veli" in expected_accrual
    assert "Aug 2026" in expected_accrual

    payment = staff_service.record_payment(
        db_session,
        ctx["entity_id"],
        ctx["employee_id"],
        StaffPaymentCreate(
            payment_date=date(2026, 8, 5),
            amount_minor=100_000,
            description="",
            actor_id=ACTOR_ID,
            payment_account_id=ctx["drawer"].gl_account_id,
            period_year=2026,
            period_month=8,
            period_salary_minor=100_000,
        ),
    )
    expected_pay = compose_staff_post_description(
        movement_type="salary_payment",
        employee_name=ctx["employee_name"],
        period_year=2026,
        period_month=8,
    )
    assert payment.staff_ledger_entry.description == expected_pay
    assert payment.staff_ledger_entry.amount_minor == -100_000


def test_staff_blank_note_posts(db_session, rich_setup):
    ctx = rich_setup
    result = staff_service.record_accrual(
        db_session,
        ctx["entity_id"],
        ctx["employee_id"],
        StaffAccrualCreate(
            accrual_date=date(2026, 8, 1),
            amount_minor=50_000,
            description="Salary accrual",
            actor_id=ACTOR_ID,
            period_year=2026,
            period_month=8,
        ),
    )
    assert " — " not in result.staff_ledger_entry.description
    assert result.staff_ledger_entry.amount_minor == 50_000


def test_fx_purchase_conversion_spend_composed(db_session, rich_setup):
    ctx = rich_setup
    expense_id = ctx["accounts"]["5200"]

    purchase = fx_posting.post_fx_purchase(
        db_session,
        ctx["entity_id"],
        fx_money_account_id=ctx["usd"].id,
        try_cash_money_account_id=ctx["drawer"].id,
        native_quantity=10_000,
        try_cost_kurus=350_000,
        purchase_date=date(2026, 8, 2),
        description=None,
        actor_id=ACTOR_ID,
    )
    expected_buy = build_fx_purchase_description(
        native_quantity=10_000,
        currency="USD",
        try_cost_kurus=350_000,
        cash_account_name="Main Drawer",
        note=None,
    )
    assert purchase.fx_ledger_entry.description == expected_buy
    assert purchase.journal_entry.description == expected_buy
    assert purchase.fx_ledger_entry.native_quantity == 10_000
    assert purchase.fx_ledger_entry.try_cost_kurus == 350_000

    conversion = fx_spend.post_fx_conversion(
        db_session,
        ctx["entity_id"],
        fx_money_account_id=ctx["usd"].id,
        try_money_account_id=ctx["drawer"].id,
        native_quantity=5_000,
        try_received_kurus=180_000,
        conversion_date=date(2026, 8, 3),
        description=None,
        actor_id=ACTOR_ID,
    )
    expected_conv = build_fx_conversion_description(
        native_quantity=5_000,
        currency="USD",
        try_received_kurus=180_000,
        note=None,
    )
    assert conversion.fx_ledger_entry.description == expected_conv

    spend = fx_spend.post_fx_expense_spend(
        db_session,
        ctx["entity_id"],
        fx_money_account_id=ctx["usd"].id,
        expense_account_id=expense_id,
        native_quantity=2_000,
        spend_date=date(2026, 8, 4),
        description="kitchen oil",
        actor_id=ACTOR_ID,
    )
    expected_spend = build_fx_spend_description(
        native_quantity=2_000,
        currency="USD",
        expense_description="kitchen oil",
        note=None,
    )
    assert spend.fx_ledger_entry.description == expected_spend


def test_partner_drawing_composed(db_session, rich_setup):
    ctx = rich_setup
    result = partner_service.record_drawing(
        db_session,
        ctx["entity_id"],
        ctx["partner_id"],
        DrawingCreate(
            drawing_date=date(2026, 8, 6),
            amount_kurus=25_000,
            description=None,
            actor_id=ACTOR_ID,
            payment_account_id=ctx["drawer"].gl_account_id,
        ),
    )
    expected = build_partner_ledger_display_description(
        movement_type="drawing",
        partner_name=ctx["partner_name"],
        subject_name=None,
        note=None,
    )
    assert result.partner_ledger_entry.description == expected
    assert result.partner_ledger_entry.amount_kurus == -25_000


def test_gl_enrichment_for_old_style_staff_description(db_session, rich_setup):
    """Stored bare text is rewritten on GL list via subledger join — no DB rewrite."""
    ctx = rich_setup
    from app.core.staff import posting as staff_posting

    result = staff_posting.post_salary_accrual(
        db_session,
        ctx["entity_id"],
        ctx["employee_id"],
        accrual_date=date(2026, 8, 1),
        amount_minor=80_000,
        description="Salary accrual",
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=8,
    )
    with entity_context(db_session, ctx["entity_id"]):
        stored = db_session.get(StaffLedgerEntry, result.staff_ledger_entry.id)
        assert stored is not None
        assert stored.description == "Salary accrual"
        je_id = stored.journal_entry_id

    outs, _ = ledger_service.list_journal_entries(db_session, ctx["entity_id"])
    match = next(o for o in outs if o.id == je_id)
    expected = build_staff_ledger_display_description(
        movement_type="salary_accrued",
        employee_name=ctx["employee_name"],
        period_year=2026,
        period_month=8,
        note=None,
    )
    assert match.description == expected
    with entity_context(db_session, ctx["entity_id"]):
        still = db_session.get(StaffLedgerEntry, result.staff_ledger_entry.id)
        assert still is not None
        assert still.description == "Salary accrual"


def test_fx_old_buy_default_is_not_kept_as_note():
    from app.features.fx.ledger_display_description import owner_note_from_stored

    body = build_fx_purchase_description(
        native_quantity=5_000,
        currency="USD",
        try_cost_kurus=175_000,
        cash_account_name="Main Drawer",
        note=None,
    )
    assert owner_note_from_stored("Buy USD", body) is None
    assert owner_note_from_stored("FX purchase", body) is None


def test_mutation_helpers_reject_bare_only_strings():
    """If composers regress to bare form defaults, these assertions fail."""
    staff = build_staff_ledger_display_description(
        movement_type="salary_payment",
        employee_name="Ali",
        period_year=2026,
        period_month=8,
        note=None,
    )
    assert staff != "Salary payment"
    assert "Ali" in staff

    fx = build_fx_purchase_description(
        native_quantity=5_000,
        currency="USD",
        try_cost_kurus=175_000,
        cash_account_name="Drawer",
        note=None,
    )
    assert fx != "FX purchase"
    assert "USD" in fx

    partner = build_partner_ledger_display_description(
        movement_type="drawing",
        partner_name="Mehmet",
        subject_name=None,
        note=None,
    )
    assert partner != "Partner cash payment"
    assert "Mehmet" in partner

    assert "build_staff_ledger_display_description" in STAFF_HELPER.read_text()
    assert "build_fx_purchase_description" in FX_HELPER.read_text()
    assert "build_partner_ledger_display_description" in PARTNER_HELPER.read_text()
