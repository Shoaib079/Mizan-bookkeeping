"""Roles & permissions — Phase 8 Slice 1."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.auth.permissions import Permission, ROLE_PERMISSIONS, user_has_permission
from app.core.auth.types import EntityRole
from app.core.chart_of_accounts.seed import seed_default_chart
from app.db.session import entity_context
from app.features.auth.models import EntityMembership, User
from app.features.auth import service as auth_service
from app.features.auth.schema import MembershipCreate, UserCreate
from tests.auth_helpers import auth_headers


@pytest.fixture
def auth_enforced(monkeypatch):
    monkeypatch.setattr(settings, "auth_enforcement", True)
    monkeypatch.setattr(settings, "clerk_test_mode", True)
    yield
    monkeypatch.setattr(settings, "auth_enforcement", False)


def _create_user(db_session: Session, email: str, name: str = "Test User") -> User:
    return auth_service.create_user(
        db_session, UserCreate(email=email, display_name=name)
    )


def _add_member(
    db_session: Session, entity_id: uuid.UUID, user_id: uuid.UUID, role: EntityRole
) -> EntityMembership:
    return auth_service.add_entity_member(
        db_session,
        entity_id,
        MembershipCreate(user_id=user_id, role=role),
    )


def test_role_permission_map() -> None:
    owner_perms = ROLE_PERMISSIONS[EntityRole.OWNER]
    assert Permission.FINANCIAL_REPORTS_READ in owner_perms
    assert Permission.ADMIN_MANAGE_MEMBERS in owner_perms

    cashier_perms = ROLE_PERMISSIONS[EntityRole.CASHIER]
    assert Permission.REPORTS_READ in cashier_perms
    assert Permission.OPERATIONS_WRITE in cashier_perms
    assert Permission.FINANCIAL_REPORTS_READ not in cashier_perms
    assert Permission.ADMIN_MANAGE_MEMBERS not in cashier_perms

    view_only_perms = ROLE_PERMISSIONS[EntityRole.PARTNER_VIEW_ONLY]
    assert Permission.FINANCIAL_REPORTS_READ in view_only_perms
    assert Permission.OPERATIONS_WRITE not in view_only_perms


@pytest.fixture
def roles_entity_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    return {"entity_id": restaurant_a.id}


def test_user_has_permission_respects_inactive_user(db_session, restaurant_a) -> None:
    _create_user(db_session, "inactive@example.com")
    assert (
        user_has_permission(
            EntityRole.OWNER, Permission.FINANCIAL_REPORTS_READ, is_active=False
        )
        is False
    )


def test_owner_can_get_pl(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    owner = _create_user(db_session, "owner@example.com", "Owner")
    _add_member(db_session, setup["entity_id"], owner.id, EntityRole.OWNER)

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/profit-and-loss",
        params={"from": "2026-01-01", "to": "2026-01-31"},
        headers=auth_headers(owner),
    )
    assert response.status_code == 200


def test_cashier_blocked_from_pl(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    cashier = _create_user(db_session, "cashier@example.com", "Cashier")
    _add_member(db_session, setup["entity_id"], cashier.id, EntityRole.CASHIER)

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/profit-and-loss",
        params={"from": "2026-01-01", "to": "2026-01-31"},
        headers=auth_headers(cashier),
    )
    assert response.status_code == 403
    assert "financial_reports:read" in response.json()["detail"]


def test_partner_view_only_can_get_pl(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    viewer = _create_user(db_session, "viewer@example.com", "Viewer")
    _add_member(
        db_session, setup["entity_id"], viewer.id, EntityRole.PARTNER_VIEW_ONLY
    )

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/profit-and-loss",
        params={"from": "2026-01-01", "to": "2026-01-31"},
        headers=auth_headers(viewer),
    )
    assert response.status_code == 200


def test_missing_bearer_token_returns_401(
    auth_enforced,
    client: TestClient,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    response = client.get(
        f"/entities/{setup['entity_id']}/reports/profit-and-loss",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    assert response.status_code == 401


def test_non_member_returns_403(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    outsider = _create_user(db_session, "outsider@example.com")

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/profit-and-loss",
        params={"from": "2026-01-01", "to": "2026-01-31"},
        headers=auth_headers(outsider),
    )
    assert response.status_code == 403
    assert "member" in response.json()["detail"].lower()


def test_pl_without_enforcement_no_header(
    client: TestClient,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    assert settings.auth_enforcement is False
    response = client.get(
        f"/entities/{setup['entity_id']}/reports/profit-and-loss",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    assert response.status_code == 200


def test_membership_crud_api(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    restaurant_a,
) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    admin = _create_user(db_session, "admin@example.com", "Admin")
    member_user = _create_user(db_session, "member@example.com", "Member")
    _add_member(db_session, restaurant_a.id, admin.id, EntityRole.OWNER)

    create_user_resp = client.post(
        "/users",
        json={"email": "new@example.com", "display_name": "New User"},
    )
    assert create_user_resp.status_code == 201
    new_user_id = create_user_resp.json()["id"]

    get_user_resp = client.get(f"/users/{new_user_id}")
    assert get_user_resp.status_code == 200
    assert get_user_resp.json()["email"] == "new@example.com"

    add_resp = client.post(
        f"/entities/{restaurant_a.id}/members",
        json={"user_id": str(member_user.id), "role": "cashier"},
        headers=auth_headers(admin),
    )
    assert add_resp.status_code == 201
    membership_id = add_resp.json()["id"]
    assert add_resp.json()["role"] == "cashier"

    list_resp = client.get(
        f"/entities/{restaurant_a.id}/members",
        headers=auth_headers(admin),
    )
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 2

    patch_resp = client.patch(
        f"/entities/{restaurant_a.id}/members/{membership_id}",
        json={"role": "partner"},
        headers=auth_headers(admin),
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["role"] == "partner"

    deactivate_resp = client.patch(
        f"/entities/{restaurant_a.id}/members/{membership_id}",
        json={"is_active": False},
        headers=auth_headers(admin),
    )
    assert deactivate_resp.status_code == 200
    assert deactivate_resp.json()["user"]["is_active"] is False


def test_add_member_by_email_creates_user_and_membership(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    restaurant_a,
) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    owner = _create_user(db_session, "owner-new-email@example.com", "Owner")
    _add_member(db_session, restaurant_a.id, owner.id, EntityRole.OWNER)

    response = client.post(
        f"/entities/{restaurant_a.id}/members",
        json={
            "email": "brand-new@example.com",
            "display_name": "Brand New",
            "role": "cashier",
        },
        headers=auth_headers(owner),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "cashier"
    assert body["user"]["email"] == "brand-new@example.com"
    assert body["user"]["display_name"] == "Brand New"

    user_count = db_session.scalar(
        select(User).where(User.email == "brand-new@example.com")
    )
    assert user_count is not None


def test_add_member_by_email_existing_user_second_restaurant(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    restaurant_a,
    restaurant_b,
) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    seed_default_chart(db_session, restaurant_b.id)
    owner_a = _create_user(db_session, "owner-a-multi@example.com", "Owner A")
    owner_b = _create_user(db_session, "owner-b-multi@example.com", "Owner B")
    partner = _create_user(db_session, "partner-multi@example.com", "Partner")
    _add_member(db_session, restaurant_a.id, owner_a.id, EntityRole.OWNER)
    _add_member(db_session, restaurant_b.id, owner_b.id, EntityRole.OWNER)
    _add_member(db_session, restaurant_a.id, partner.id, EntityRole.PARTNER)

    before_count = len(db_session.scalars(select(User)).all())

    response = client.post(
        f"/entities/{restaurant_b.id}/members",
        json={"email": "partner-multi@example.com", "role": "partner"},
        headers=auth_headers(owner_b),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["user_id"] == str(partner.id)
    assert body["entity_id"] == str(restaurant_b.id)
    assert body["role"] == "partner"

    after_count = len(db_session.scalars(select(User)).all())
    assert after_count == before_count


def test_add_member_by_email_already_member_returns_409(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    restaurant_a,
) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    owner = _create_user(db_session, "owner-dup@example.com", "Owner")
    member = _create_user(db_session, "dup-member@example.com", "Member")
    _add_member(db_session, restaurant_a.id, owner.id, EntityRole.OWNER)
    _add_member(db_session, restaurant_a.id, member.id, EntityRole.CASHIER)

    response = client.post(
        f"/entities/{restaurant_a.id}/members",
        json={"email": "dup-member@example.com", "role": "partner"},
        headers=auth_headers(owner),
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Already a member of this restaurant."


def test_get_my_membership_when_auth_enforced(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    cashier = _create_user(db_session, "me-cashier@example.com", "Cashier")
    _add_member(db_session, setup["entity_id"], cashier.id, EntityRole.CASHIER)

    response = client.get(
        f"/entities/{setup['entity_id']}/members/me",
        headers=auth_headers(cashier),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "cashier"
    assert "operations:write" in body["permissions"]
    assert "financial_reports:read" not in body["permissions"]


def test_get_my_membership_dev_mode_defaults_owner(
    client: TestClient,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    assert settings.auth_enforcement is False

    response = client.get(f"/entities/{setup['entity_id']}/members/me")
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "owner"
    assert "operations:write" in body["permissions"]
    assert "financial_reports:read" in body["permissions"]


def test_get_my_membership_dev_mode_x_user_id_lookup(
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    view_only = _create_user(db_session, "viewonly@example.com", "View Only")
    _add_member(
        db_session,
        setup["entity_id"],
        view_only.id,
        EntityRole.PARTNER_VIEW_ONLY,
    )
    assert settings.auth_enforcement is False

    response = client.get(
        f"/entities/{setup['entity_id']}/members/me",
        headers={"X-User-Id": str(view_only.id)},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "partner_view_only"
    assert "operations:write" not in body["permissions"]
    assert "financial_reports:read" in body["permissions"]


def test_cashier_can_access_dashboard_when_enforced(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    cashier = _create_user(db_session, "dash-cashier@example.com")
    _add_member(db_session, setup["entity_id"], cashier.id, EntityRole.CASHIER)

    response = client.get(
        f"/entities/{setup['entity_id']}/dashboard",
        params={"from": "2026-01-01", "to": "2026-01-31"},
        headers=auth_headers(cashier),
    )
    assert response.status_code == 200


def test_cashier_blocked_from_balance_sheet_export(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    cashier = _create_user(db_session, "bs-cashier@example.com")
    _add_member(db_session, setup["entity_id"], cashier.id, EntityRole.CASHIER)

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/balance-sheet/export",
        params={"as_of": "2026-01-31"},
        headers=auth_headers(cashier),
    )
    assert response.status_code == 403


def test_view_only_blocked_from_operations_write(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    viewer = _create_user(db_session, "viewer-write@example.com")
    _add_member(
        db_session, setup["entity_id"], viewer.id, EntityRole.PARTNER_VIEW_ONLY
    )

    response = client.post(
        f"/entities/{setup['entity_id']}/suppliers",
        json={"name": "Blocked Supplier", "vkn": "1234567890"},
        headers=auth_headers(viewer),
    )
    assert response.status_code == 403
    assert "operations:write" in response.json()["detail"]


def test_cross_entity_write_blocked(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
    restaurant_b,
) -> None:
    setup = roles_entity_setup
    seed_default_chart(db_session, restaurant_b.id)
    owner = _create_user(db_session, "owner-a@example.com")
    _add_member(db_session, setup["entity_id"], owner.id, EntityRole.OWNER)

    response = client.post(
        f"/entities/{restaurant_b.id}/suppliers",
        json={"name": "Cross Entity Supplier", "vkn": "9876543210"},
        headers=auth_headers(owner),
    )
    assert response.status_code == 403
    assert "member" in response.json()["detail"].lower()


def test_non_member_blocked_from_delivery_sales(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    outsider = _create_user(db_session, "outsider-delivery@example.com")

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/delivery-sales",
        params={"from": "2026-01-01", "to": "2026-01-31"},
        headers=auth_headers(outsider),
    )
    assert response.status_code == 403
    assert "member" in response.json()["detail"].lower()


def test_non_member_blocked_from_supplier_ledger(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    owner = _create_user(db_session, "owner-ledger@example.com")
    _add_member(db_session, setup["entity_id"], owner.id, EntityRole.OWNER)
    create_resp = client.post(
        f"/entities/{setup['entity_id']}/suppliers",
        json={"name": "Ledger Supplier", "vkn": "1234567890"},
        headers=auth_headers(owner),
    )
    assert create_resp.status_code == 201
    supplier_id = create_resp.json()["id"]

    outsider = _create_user(db_session, "outsider-ledger@example.com")
    response = client.get(
        f"/entities/{setup['entity_id']}/suppliers/{supplier_id}/ledger",
        headers=auth_headers(outsider),
    )
    assert response.status_code == 403
    assert "member" in response.json()["detail"].lower()


def test_non_member_blocked_from_bank_list(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    outsider = _create_user(db_session, "outsider-bank@example.com")

    response = client.get(
        f"/entities/{setup['entity_id']}/banking/accounts",
        headers=auth_headers(outsider),
    )
    assert response.status_code == 403
    assert "member" in response.json()["detail"].lower()


def test_non_member_blocked_from_expenses(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    outsider = _create_user(db_session, "outsider-expenses@example.com")

    response = client.get(
        f"/entities/{setup['entity_id']}/expenses",
        headers=auth_headers(outsider),
    )
    assert response.status_code == 403
    assert "member" in response.json()["detail"].lower()


def test_cross_entity_read_blocked(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
    restaurant_b,
) -> None:
    setup = roles_entity_setup
    seed_default_chart(db_session, restaurant_b.id)
    owner = _create_user(db_session, "owner-read-a@example.com")
    _add_member(db_session, setup["entity_id"], owner.id, EntityRole.OWNER)

    response = client.get(
        f"/entities/{restaurant_b.id}/expenses",
        headers=auth_headers(owner),
    )
    assert response.status_code == 403
    assert "member" in response.json()["detail"].lower()


def test_list_entities_returns_only_caller_memberships(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
    restaurant_b,
) -> None:
    setup = roles_entity_setup
    member = _create_user(db_session, "member-list@example.com")
    _add_member(db_session, setup["entity_id"], member.id, EntityRole.CASHIER)

    response = client.get("/entities", headers=auth_headers(member))
    assert response.status_code == 200
    entity_ids = {row["id"] for row in response.json()["items"]}
    assert str(setup["entity_id"]) in entity_ids
    assert str(restaurant_b.id) not in entity_ids


def test_create_entity_requires_authenticated_user(
    auth_enforced,
    client: TestClient,
) -> None:
    response = client.post("/entities", json={"name": "No Auth Entity"})
    assert response.status_code == 401


def test_create_entity_adds_creator_as_owner_and_lists_entity(
    auth_enforced,
    client: TestClient,
    db_session: Session,
) -> None:
    creator = _create_user(db_session, "creator-owner@example.com")

    create = client.post(
        "/entities",
        json={"name": "Creator Restaurant"},
        headers=auth_headers(creator),
    )
    assert create.status_code == 201
    entity_id = uuid.UUID(create.json()["id"])

    listed = client.get("/entities", headers=auth_headers(creator))
    assert listed.status_code == 200
    entity_ids = {row["id"] for row in listed.json()["items"]}
    assert str(entity_id) in entity_ids

    get_one = client.get(f"/entities/{entity_id}", headers=auth_headers(creator))
    assert get_one.status_code == 200

    with entity_context(db_session, entity_id):
        membership = db_session.scalar(
            select(EntityMembership).where(
                EntityMembership.entity_id == entity_id,
                EntityMembership.user_id == creator.id,
            )
        )
    assert membership is not None
    assert membership.role == EntityRole.OWNER.value


def test_create_entity_dev_mode_does_not_add_membership(
    client: TestClient,
    db_session: Session,
) -> None:
    response = client.post("/entities", json={"name": "Dev Mode Entity"})
    assert response.status_code == 201
    entity_id = uuid.UUID(response.json()["id"])

    count = db_session.scalar(
        select(EntityMembership).where(EntityMembership.entity_id == entity_id)
    )
    assert count is None
