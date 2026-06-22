"""Period-over-period comparison report (Phase 7 Slice 6)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.cash.posting import post_cash_movement
from app.core.chart_of_accounts.default_chart import SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.pos import posting as pos_posting
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.cash.models import CashMovementDirection
from app.features.reports import period_comparison
from app.features.reports.service import InvalidDateRangeError
from tests.delivery_helpers import ACTOR_ID


@pytest.fixture
def comparison_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "accounts": accounts,
    }


def _metric_map(report) -> dict[str, dict]:
    return {row.key: row for row in report.metrics}


def _post_cash_sale(
    db_session,
    setup,
    *,
    sale_date: date,
    amount_kurus: int,
) -> None:
    post_cash_movement(
        db_session,
        setup["entity_id"],
        money_account_id=setup["drawer"].id,
        movement_date=sale_date,
        direction=CashMovementDirection.IN,
        amount_kurus=amount_kurus,
        offset_account_id=setup["accounts"][SALES_REVENUE_CODE],
        description="Cash sales",
        actor_id=ACTOR_ID,
    )


def _post_card_sale(
    db_session,
    setup,
    *,
    sale_date: date,
    amount_kurus: int,
) -> None:
    pos_posting.post_card_sales_batch(
        db_session,
        setup["entity_id"],
        sales_date=sale_date,
        gross_amount_kurus=amount_kurus,
        description="Card sales",
        actor_id=ACTOR_ID,
    )


def test_auto_prior_period_same_length_as_current(db_session, comparison_setup) -> None:
    report = period_comparison.get_period_comparison(
        db_session,
        comparison_setup["entity_id"],
        date(2026, 3, 1),
        date(2026, 3, 31),
    )

    assert report.prior_from == date(2026, 1, 29)
    assert report.prior_to == date(2026, 2, 28)
    current_days = (report.current_to - report.current_from).days + 1
    prior_days = (report.prior_to - report.prior_from).days + 1
    assert current_days == prior_days == 31


def test_metrics_differ_when_activity_in_one_period_only(
    db_session, comparison_setup
) -> None:
    setup = comparison_setup
    _post_cash_sale(db_session, setup, sale_date=date(2026, 3, 10), amount_kurus=100_000)
    _post_card_sale(db_session, setup, sale_date=date(2026, 3, 15), amount_kurus=200_000)

    report = period_comparison.get_period_comparison(
        db_session,
        setup["entity_id"],
        date(2026, 3, 1),
        date(2026, 3, 31),
    )
    metrics = _metric_map(report)

    assert metrics["total_sales_kurus"].current_kurus == 300_000
    assert metrics["total_sales_kurus"].prior_kurus == 0
    assert metrics["cash_sales_kurus"].current_kurus == 100_000
    assert metrics["pos_card_sales_kurus"].current_kurus == 200_000


def test_change_kurus_and_change_percent(db_session, comparison_setup) -> None:
    setup = comparison_setup
    _post_cash_sale(db_session, setup, sale_date=date(2026, 2, 5), amount_kurus=50_000)
    _post_cash_sale(db_session, setup, sale_date=date(2026, 3, 10), amount_kurus=100_000)

    report = period_comparison.get_period_comparison(
        db_session,
        setup["entity_id"],
        date(2026, 3, 1),
        date(2026, 3, 31),
    )
    sales = _metric_map(report)["total_sales_kurus"]

    assert sales.current_kurus == 100_000
    assert sales.prior_kurus == 50_000
    assert sales.change_kurus == 50_000
    assert sales.change_percent == 100.0

    zero_prior = period_comparison.get_period_comparison(
        db_session,
        setup["entity_id"],
        date(2026, 4, 1),
        date(2026, 4, 30),
    )
    card_sales = _metric_map(zero_prior)["pos_card_sales_kurus"]
    assert card_sales.prior_kurus == 0
    assert card_sales.change_percent is None


def test_explicit_prior_override(db_session, comparison_setup) -> None:
    report = period_comparison.get_period_comparison(
        db_session,
        comparison_setup["entity_id"],
        date(2026, 3, 1),
        date(2026, 3, 31),
        prior_from=date(2025, 12, 1),
        prior_to=date(2025, 12, 31),
    )

    assert report.prior_from == date(2025, 12, 1)
    assert report.prior_to == date(2025, 12, 31)


def test_only_one_prior_param_raises_422(db_session, comparison_setup) -> None:
    with pytest.raises(InvalidDateRangeError, match="both be provided"):
        period_comparison.get_period_comparison(
            db_session,
            comparison_setup["entity_id"],
            date(2026, 3, 1),
            date(2026, 3, 31),
            prior_from=date(2026, 1, 1),
            prior_to=None,
        )

    with pytest.raises(InvalidDateRangeError, match="both be provided"):
        period_comparison.get_period_comparison(
            db_session,
            comparison_setup["entity_id"],
            date(2026, 3, 1),
            date(2026, 3, 31),
            prior_from=None,
            prior_to=date(2026, 2, 28),
        )


def test_from_after_to_raises_422(db_session, comparison_setup) -> None:
    with pytest.raises(InvalidDateRangeError):
        period_comparison.get_period_comparison(
            db_session,
            comparison_setup["entity_id"],
            date(2026, 3, 31),
            date(2026, 3, 1),
        )


def test_period_comparison_api_e2e(
    db_session, client: TestClient, comparison_setup
) -> None:
    setup = comparison_setup
    _post_cash_sale(db_session, setup, sale_date=date(2026, 3, 10), amount_kurus=80_000)

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/period-comparison",
        params={"from": "2026-03-01", "to": "2026-03-31"},
    )
    assert response.status_code == 200
    body = response.json()

    assert body["entity_id"] == str(setup["entity_id"])
    assert body["current_from"] == "2026-03-01"
    assert body["current_to"] == "2026-03-31"
    assert body["prior_from"] == "2026-01-29"
    assert body["prior_to"] == "2026-02-28"

    sales = next(m for m in body["metrics"] if m["key"] == "total_sales_kurus")
    assert sales["current_kurus"] == 80_000
    assert sales["prior_kurus"] == 0
    assert sales["change_kurus"] == 80_000
    assert sales["change_percent"] is None

    bad_range = client.get(
        f"/entities/{setup['entity_id']}/reports/period-comparison",
        params={"from": "2026-03-31", "to": "2026-03-01"},
    )
    assert bad_range.status_code == 422

    partial_prior = client.get(
        f"/entities/{setup['entity_id']}/reports/period-comparison",
        params={"from": "2026-03-01", "to": "2026-03-31", "prior_from": "2026-01-01"},
    )
    assert partial_prior.status_code == 422

    missing_entity = uuid.uuid4()
    missing = client.get(
        f"/entities/{missing_entity}/reports/period-comparison",
        params={"from": "2026-03-01", "to": "2026-03-31"},
    )
    assert missing.status_code == 404


def test_cross_entity_isolation(
    db_session, client: TestClient, comparison_setup, restaurant_b
) -> None:
    setup = comparison_setup
    seed_default_chart(db_session, restaurant_b.id)
    _post_cash_sale(db_session, setup, sale_date=date(2026, 3, 10), amount_kurus=150_000)

    report_a = period_comparison.get_period_comparison(
        db_session,
        setup["entity_id"],
        date(2026, 3, 1),
        date(2026, 3, 31),
    )
    report_b = period_comparison.get_period_comparison(
        db_session,
        restaurant_b.id,
        date(2026, 3, 1),
        date(2026, 3, 31),
    )

    sales_a = _metric_map(report_a)["total_sales_kurus"]
    sales_b = _metric_map(report_b)["total_sales_kurus"]

    assert sales_a.current_kurus == 150_000
    assert sales_b.current_kurus == 0
    assert sales_b.prior_kurus == 0

    api_b = client.get(
        f"/entities/{restaurant_b.id}/reports/period-comparison",
        params={"from": "2026-03-01", "to": "2026-03-31"},
    )
    assert api_b.status_code == 200
    api_sales = next(
        m for m in api_b.json()["metrics"] if m["key"] == "total_sales_kurus"
    )
    assert api_sales["current_kurus"] == 0
