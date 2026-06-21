"""Chart of accounts — per-entity persistence and isolation (Phase 1)."""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.core.chart_of_accounts.default_chart import DEFAULT_CHART
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import ChartAlreadySeededError, seed_default_chart
from app.db.session import entity_context


def test_seed_creates_full_default_chart(db_session, restaurant_a) -> None:
    accounts = seed_default_chart(db_session, restaurant_a.id)
    assert len(accounts) == len(DEFAULT_CHART)
    codes = {a.code for a in accounts}
    assert "3900" in codes
    assert "1100" in codes


def test_seed_rejects_duplicate(db_session, restaurant_a) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    with pytest.raises(ChartAlreadySeededError):
        seed_default_chart(db_session, restaurant_a.id)


def test_entity_a_accounts_invisible_to_entity_b(
    db_session, restaurant_a, restaurant_b
) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    seed_default_chart(db_session, restaurant_b.id)

    with entity_context(db_session, restaurant_a.id):
        a_count = len(list(db_session.scalars(select(Account))))
    assert a_count == len(DEFAULT_CHART)

    with entity_context(db_session, restaurant_b.id):
        b_visible_a_code = db_session.scalar(
            select(Account).where(Account.code == "1100")
        )
        assert b_visible_a_code is not None
        # Under B context, cannot see A's rows even with raw count trick
        all_b = list(db_session.scalars(select(Account)))
        assert all(a.entity_id == restaurant_b.id for a in all_b)

    with entity_context(db_session, restaurant_b.id):
        rows = db_session.execute(
            text("SELECT code FROM accounts WHERE entity_id = :aid"),
            {"aid": str(restaurant_a.id)},
        ).all()
        assert rows == []


def test_api_seed_and_list(client: TestClient, restaurant_a) -> None:
    seed = client.post(f"/entities/{restaurant_a.id}/chart-of-accounts/seed")
    assert seed.status_code == 201
    body = seed.json()
    assert body["accounts_created"] == len(DEFAULT_CHART)

    listing = client.get(f"/entities/{restaurant_a.id}/chart-of-accounts")
    assert listing.status_code == 200
    assert len(listing.json()) == len(DEFAULT_CHART)


def test_api_seed_conflict(client: TestClient, restaurant_a) -> None:
    client.post(f"/entities/{restaurant_a.id}/chart-of-accounts/seed")
    again = client.post(f"/entities/{restaurant_a.id}/chart-of-accounts/seed")
    assert again.status_code == 409


def test_api_list_unknown_entity(client: TestClient) -> None:
    response = client.get(f"/entities/{uuid.uuid4()}/chart-of-accounts")
    assert response.status_code == 404
