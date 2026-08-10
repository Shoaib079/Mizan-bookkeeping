"""Deleting a restaurant from Settings — who may, what goes, what is left open.

The script has its own tests. This is the route, which is a different thing in
two ways that matter: it runs as `mizan_app`, the role that deliberately cannot
disable a trigger, and it is reachable by anyone who can reach the app.

So the questions here are: does the permission gate hold, does the delete
actually work through a role with no ownership, and — the one that would be
silent — is the ledger closed again afterwards.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.core.auth.types import EntityRole
from app.core.chart_of_accounts.seed import seed_default_chart
from app.features.auth import service as auth_service
from app.features.auth.models import AuthAuditEvent, User
from app.features.auth.schema import MembershipCreate, UserCreate
from tests.auth_helpers import auth_headers


#: Read off the enum rather than listed, so a role added next year is refused
#: by this test on the day it appears instead of whenever someone remembers.
NON_OWNER_ROLES = [role for role in EntityRole if role is not EntityRole.OWNER]


def test_there_are_other_roles_to_refuse() -> None:
    """Guard the guard — over an empty list the parametrised test vanishes."""
    assert len(NON_OWNER_ROLES) >= 3


@pytest.fixture
def auth_enforced(monkeypatch):
    monkeypatch.setattr(settings, "auth_enforcement", True)
    monkeypatch.setattr(settings, "clerk_test_mode", True)
    yield
    monkeypatch.setattr(settings, "auth_enforcement", False)


def _user(db_session: Session, email: str) -> User:
    return auth_service.create_user(
        db_session, UserCreate(email=email, display_name=email.split("@")[0])
    )


def _member(db_session: Session, entity_id: uuid.UUID, user: User, role: EntityRole):
    return auth_service.add_entity_member(
        db_session, entity_id, MembershipCreate(user_id=user.id, role=role)
    )


@pytest.fixture
def two_restaurants(db_session, restaurant_a, restaurant_b):
    for entity in (restaurant_a, restaurant_b):
        seed_default_chart(db_session, entity.id)
    db_session.commit()
    return restaurant_a.id, restaurant_b.id


def _exists(session: Session, entity_id: uuid.UUID) -> bool:
    return (
        session.execute(
            text("SELECT count(*) FROM entities WHERE id = :e"), {"e": str(entity_id)}
        ).scalar_one()
        > 0
    )


def _switched_off(session: Session) -> list[str]:
    """Delete-blocking triggers currently disabled.

    By `tgenabled`, not by name. A disabled trigger is still listed in
    `pg_trigger`, so a name check reports a healthy ledger over a wide open one.
    """
    return [
        f"{row[0]}.{row[1]}"
        for row in session.execute(
            text(
                """
                SELECT c.relname, t.tgname
                FROM pg_trigger t
                JOIN pg_class c ON c.oid = t.tgrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE NOT t.tgisinternal AND n.nspname = 'public'
                  AND (t.tgtype & 8) <> 0 AND t.tgenabled = 'D'
                """
            )
        )
    ]


class TestOnlyAnOwner:
    @pytest.mark.parametrize("role", NON_OWNER_ROLES, ids=lambda r: r.value)
    def test_every_other_role_is_refused(
        self, auth_enforced, client: TestClient, db_session, two_restaurants, role
    ):
        entity_id, _ = two_restaurants
        member = _user(db_session, f"{role.value}@example.com")
        _member(db_session, entity_id, member, role)

        response = client.delete(
            f"/entities/{entity_id}", headers=auth_headers(member)
        )
        assert response.status_code == 403
        assert _exists(db_session, entity_id)

    def test_a_stranger_is_refused(
        self, auth_enforced, client: TestClient, db_session, two_restaurants
    ):
        entity_id, _ = two_restaurants
        outsider = _user(db_session, "outsider@example.com")

        response = client.delete(
            f"/entities/{entity_id}", headers=auth_headers(outsider)
        )
        assert response.status_code == 403
        assert _exists(db_session, entity_id)

    def test_an_owner_of_the_other_restaurant_is_refused(
        self, auth_enforced, client: TestClient, db_session, two_restaurants
    ):
        """Owning one restaurant confers nothing over the other.

        This is the shape of the mistake worth guarding: the two are adjacent
        in the switcher and the same person owns both in real life, so the
        check has to be per-restaurant rather than "is an owner somewhere".
        """
        entity_id, other_id = two_restaurants
        owner = _user(db_session, "owner-of-b@example.com")
        _member(db_session, other_id, owner, EntityRole.OWNER)

        response = client.delete(f"/entities/{entity_id}", headers=auth_headers(owner))
        assert response.status_code == 403
        assert _exists(db_session, entity_id)


class TestAnOwnerCan:
    @pytest.fixture
    def owner(self, db_session, two_restaurants):
        entity_id, _ = two_restaurants
        user = _user(db_session, "owner@example.com")
        _member(db_session, entity_id, user, EntityRole.OWNER)
        return user

    def test_it_deletes(
        self, auth_enforced, client: TestClient, db_session, two_restaurants, owner
    ):
        entity_id, _ = two_restaurants
        response = client.delete(f"/entities/{entity_id}", headers=auth_headers(owner))
        assert response.status_code == 204
        assert not _exists(db_session, entity_id)

    def test_the_app_role_gets_through_the_triggers(
        self, auth_enforced, client: TestClient, db_session, two_restaurants, owner
    ):
        """The point of the SECURITY DEFINER function.

        `mizan_app` cannot disable a trigger, and the chart of accounts alone
        puts rows in an RLS table. Without the function this returns 500.
        """
        entity_id, _ = two_restaurants
        assert (
            db_session.execute(
                text("SELECT count(*) FROM accounts WHERE entity_id = :e"),
                {"e": str(entity_id)},
            ).scalar_one()
            == 0  # RLS hides them from this connection; they are there.
        )

        response = client.delete(f"/entities/{entity_id}", headers=auth_headers(owner))
        assert response.status_code == 204

    def test_the_other_restaurant_is_untouched(
        self, auth_enforced, client: TestClient, db_session, two_restaurants, owner
    ):
        entity_id, other_id = two_restaurants
        assert client.delete(
            f"/entities/{entity_id}", headers=auth_headers(owner)
        ).status_code == 204
        assert _exists(db_session, other_id)

    def test_the_ledger_is_closed_again_afterwards(
        self, auth_enforced, client: TestClient, db_session, two_restaurants, owner
    ):
        """The failure that leaves no mark at the time.

        If the function returned without re-enabling, everything above still
        passes and the books quietly stop being immutable from then on.
        """
        entity_id, _ = two_restaurants
        assert _switched_off(db_session) == []

        assert client.delete(
            f"/entities/{entity_id}", headers=auth_headers(owner)
        ).status_code == 204

        assert _switched_off(db_session) == []

    def test_a_double_press_replays_the_first_answer(
        self, auth_enforced, client: TestClient, db_session, two_restaurants, owner
    ):
        """The 204 path through idempotency, which never worked.

        `idempotency_records.response_body` is NOT NULL, and a 204 has no body,
        so storing the record raised `IntegrityError` — caught, rolled back,
        and swallowed. Nothing failed loudly, so no 204 route has ever been
        idempotent: removing a member, rejecting a receipt, rejecting an
        invoice draft, rejecting a POS summary. Every double submit ran twice.

        Here that meant a second press answering 403 on a delete that had
        worked, which reads as failure. Now the cached 204 comes back and the
        route is never reached a second time.
        """
        entity_id, _ = two_restaurants
        headers = {**auth_headers(owner), "Idempotency-Key": str(uuid.uuid4())}

        first = client.delete(f"/entities/{entity_id}", headers=headers)
        second = client.delete(f"/entities/{entity_id}", headers=headers)

        assert first.status_code == 204
        assert second.status_code == 204, "the cached 204 was not stored"
        assert not _exists(db_session, entity_id)

    def test_deleting_the_same_restaurant_twice_is_a_404_not_a_500(
        self, auth_enforced, client: TestClient, db_session, two_restaurants, owner
    ):
        entity_id, _ = two_restaurants
        assert client.delete(
            f"/entities/{entity_id}", headers=auth_headers(owner)
        ).status_code == 204

        again = client.delete(f"/entities/{entity_id}", headers=auth_headers(owner))
        # The membership is gone with the restaurant, so the guard answers
        # first. Either way it must not be a server error.
        assert again.status_code in (403, 404)


class TestRequestsForARestaurantThatIsGone:
    """A stale tab, a bookmark, a typed URL — all must be refused, not crash.

    The membership guard answers "not a member" by writing a `permission_denied`
    audit row scoped to the restaurant in the request. When that restaurant does
    not exist the foreign key refuses the row, and the 403 became a 500. Nothing
    about this is specific to deletion: any unrecognised id in a URL did it.
    """

    def test_a_deleted_restaurant_answers_403(
        self, auth_enforced, client: TestClient, db_session, two_restaurants
    ):
        entity_id, _ = two_restaurants
        owner = _user(db_session, "owner@example.com")
        _member(db_session, entity_id, owner, EntityRole.OWNER)

        assert client.delete(
            f"/entities/{entity_id}", headers=auth_headers(owner)
        ).status_code == 204

        again = client.get(
            f"/entities/{entity_id}/suppliers", headers=auth_headers(owner)
        )
        assert again.status_code == 403

    def test_an_id_that_never_existed_answers_403(
        self, auth_enforced, client: TestClient, db_session, two_restaurants
    ):
        entity_id, _ = two_restaurants
        member = _user(db_session, "member@example.com")
        _member(db_session, entity_id, member, EntityRole.OWNER)

        response = client.get(
            f"/entities/{uuid.uuid4()}/suppliers", headers=auth_headers(member)
        )
        assert response.status_code == 403

    def test_the_denial_is_still_recorded(
        self, auth_enforced, client: TestClient, db_session, two_restaurants
    ):
        """Falling back must not quietly drop the audit row.

        A `try/except` that swallowed the write would also turn the 500 into a
        403, and look identical from outside.
        """
        entity_id, _ = two_restaurants
        member = _user(db_session, "member@example.com")
        _member(db_session, entity_id, member, EntityRole.OWNER)
        missing = uuid.uuid4()

        client.get(f"/entities/{missing}/suppliers", headers=auth_headers(member))

        db_session.expire_all()
        denials = list(
            db_session.scalars(
                select(AuthAuditEvent).where(
                    AuthAuditEvent.action == "permission_denied"
                )
            )
        )
        assert len(denials) == 1
        assert denials[0].entity_id is None
        assert str(missing) in (denials[0].detail or "")


class TestTheAuditTrail:
    @pytest.fixture
    def owner(self, db_session, two_restaurants):
        entity_id, _ = two_restaurants
        user = _user(db_session, "owner@example.com")
        _member(db_session, entity_id, user, EntityRole.OWNER)
        return user

    def test_it_records_the_deletion_and_the_record_outlives_it(
        self, auth_enforced, client: TestClient, db_session, two_restaurants, owner
    ):
        """Written before the delete, and detached rather than destroyed.

        Everything else this restaurant had is entity-scoped and goes with it.
        This row is the only thing left saying it ever existed, which is why
        `auth_audit_events.entity_id` is SET NULL rather than CASCADE.
        """
        entity_id, _ = two_restaurants
        assert client.delete(
            f"/entities/{entity_id}", headers=auth_headers(owner)
        ).status_code == 204

        db_session.expire_all()
        events = list(
            db_session.scalars(
                select(AuthAuditEvent).where(AuthAuditEvent.action == "entity_deleted")
            )
        )
        assert len(events) == 1
        assert events[0].entity_id is None, "should have detached, not vanished"
        assert events[0].user_id == owner.id
