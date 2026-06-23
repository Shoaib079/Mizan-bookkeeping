"""Flexible dates and soft period locks — Phase 8.5 Slice 4."""

from __future__ import annotations

import uuid
from datetime import date, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.auth.types import EntityRole
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntrySource
from app.core.ledger.posting import PostingLine, post_journal_entry
from app.core.period_locks.guards import utc_today
from app.core.period_locks.models import (
    PeriodLock,
    PeriodLockAuditAction,
    PeriodLockAuditEvent,
    PeriodLockKind,
)
from app.core.period_locks.service import close_period
from app.db.session import entity_context
from app.features.auth import service as auth_service
from app.features.auth.models import EntityMembership, User
from app.features.auth.schema import MembershipCreate, UserCreate
from app.features.entities.models import EntitySetting
from tests.auth_helpers import auth_headers


@pytest.fixture
def auth_enforced(monkeypatch):
    monkeypatch.setattr(settings, "auth_enforcement", True)
    monkeypatch.setattr(settings, "clerk_test_mode", True)
    yield
    monkeypatch.setattr(settings, "auth_enforcement", False)


def _create_user(db_session: Session, email: str) -> User:
    return auth_service.create_user(
        db_session, UserCreate(email=email, display_name=email.split("@")[0])
    )


def _add_member(
    db_session: Session, entity_id: uuid.UUID, user_id: uuid.UUID, role: EntityRole
) -> EntityMembership:
    return auth_service.add_entity_member(
        db_session,
        entity_id,
        MembershipCreate(user_id=user_id, role=role),
    )


def _set_go_live(db_session: Session, entity_id: uuid.UUID, go_live: date) -> None:
    with entity_context(db_session, entity_id):
        db_session.add(EntitySetting(key="go_live_date", value=go_live.isoformat()))
        db_session.commit()


def _account_ids(db_session: Session, entity_id: uuid.UUID) -> dict[str, uuid.UUID]:
    seed_default_chart(db_session, entity_id)
    with entity_context(db_session, entity_id):
        from app.core.chart_of_accounts.models import Account

        accounts = list(db_session.scalars(select(Account)))
    return {account.code: account.id for account in accounts}


def _manual_payload(
    bank_id: uuid.UUID,
    ap_id: uuid.UUID,
    actor_id: uuid.UUID,
    entry_date: str | None = "2026-01-15",
    *,
    period_unlock_reason: str | None = None,
) -> dict:
    payload = {
        "description": "Period lock test",
        "actor_id": str(actor_id),
        "lines": [
            {"account_id": str(bank_id), "amount_kurus": 10000, "side": "debit"},
            {"account_id": str(ap_id), "amount_kurus": 10000, "side": "credit"},
        ],
    }
    if entry_date is not None:
        payload["entry_date"] = entry_date
    if period_unlock_reason is not None:
        payload["period_unlock_reason"] = period_unlock_reason
    return payload


@pytest.fixture
def lock_setup(db_session: Session, restaurant_a):
    go_live = date(2026, 1, 1)
    _set_go_live(db_session, restaurant_a.id, go_live)
    accounts = _account_ids(db_session, restaurant_a.id)
    owner = _create_user(db_session, "period-owner@example.com")
    cashier = _create_user(db_session, "period-cashier@example.com")
    _add_member(db_session, restaurant_a.id, owner.id, EntityRole.OWNER)
    _add_member(db_session, restaurant_a.id, cashier.id, EntityRole.CASHIER)
    return {
        "entity_id": restaurant_a.id,
        "go_live": go_live,
        "accounts": accounts,
        "owner": owner,
        "cashier": cashier,
    }


def test_go_live_floor_rejects_entry_before_go_live(
    client: TestClient, lock_setup
) -> None:
    setup = lock_setup
    bank_id = setup["accounts"]["1100"]
    ap_id = setup["accounts"]["2000"]
    response = client.post(
        f"/entities/{setup['entity_id']}/manual-journals",
        json=_manual_payload(bank_id, ap_id, setup["owner"].id, "2025-12-31"),
    )
    assert response.status_code == 422
    assert "go-live" in response.json()["detail"].lower()


def test_close_day_blocks_non_owner_post(
    auth_enforced,
    client: TestClient,
    lock_setup,
) -> None:
    setup = lock_setup
    bank_id = setup["accounts"]["1100"]
    ap_id = setup["accounts"]["2000"]
    locked_day = date(2026, 1, 15)

    close_resp = client.post(
        f"/entities/{setup['entity_id']}/period-locks/close",
        json={"lock_kind": "day", "anchor_date": locked_day.isoformat()},
        headers=auth_headers(setup["owner"]),
    )
    assert close_resp.status_code == 201

    blocked = client.post(
        f"/entities/{setup['entity_id']}/manual-journals",
        json=_manual_payload(bank_id, ap_id, setup["cashier"].id, locked_day.isoformat()),
        headers=auth_headers(setup["cashier"]),
    )
    assert blocked.status_code == 422
    assert "closed period" in blocked.json()["detail"].lower()


def test_owner_unlock_write_succeeds_with_audit(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    lock_setup,
) -> None:
    setup = lock_setup
    bank_id = setup["accounts"]["1100"]
    ap_id = setup["accounts"]["2000"]
    locked_day = date(2026, 1, 16)

    client.post(
        f"/entities/{setup['entity_id']}/period-locks/close",
        json={"lock_kind": "day", "anchor_date": locked_day.isoformat()},
        headers=auth_headers(setup["owner"]),
    )

    response = client.post(
        f"/entities/{setup['entity_id']}/manual-journals",
        json=_manual_payload(
            bank_id,
            ap_id,
            setup["owner"].id,
            locked_day.isoformat(),
            period_unlock_reason="Correcting missed accrual",
        ),
        headers=auth_headers(setup["owner"]),
    )
    assert response.status_code == 201

    with entity_context(db_session, setup["entity_id"]):
        audits = list(
            db_session.scalars(
                select(PeriodLockAuditEvent).where(
                    PeriodLockAuditEvent.action == PeriodLockAuditAction.UNLOCK_WRITE
                )
            )
        )
    assert len(audits) == 1
    assert audits[0].reason == "Correcting missed accrual"
    assert audits[0].actor_id == setup["owner"].id


def test_close_month_blocks_backdated_entry_in_month(
    auth_enforced,
    client: TestClient,
    lock_setup,
) -> None:
    setup = lock_setup
    bank_id = setup["accounts"]["1100"]
    ap_id = setup["accounts"]["2000"]

    client.post(
        f"/entities/{setup['entity_id']}/period-locks/close",
        json={"lock_kind": "month", "anchor_date": "2026-02-01"},
        headers=auth_headers(setup["owner"]),
    )

    blocked = client.post(
        f"/entities/{setup['entity_id']}/manual-journals",
        json=_manual_payload(bank_id, ap_id, setup["cashier"].id, "2026-02-20"),
        headers=auth_headers(setup["cashier"]),
    )
    assert blocked.status_code == 422


def test_correct_checks_void_date_and_corrected_entry_date(
    auth_enforced,
    client: TestClient,
    lock_setup,
) -> None:
    setup = lock_setup
    bank_id = setup["accounts"]["1100"]
    ap_id = setup["accounts"]["2000"]
    original_date = date(2026, 3, 10)

    create = client.post(
        f"/entities/{setup['entity_id']}/manual-journals",
        json=_manual_payload(
            bank_id, ap_id, setup["owner"].id, original_date.isoformat()
        ),
        headers=auth_headers(setup["owner"]),
    )
    entry_id = create.json()["id"]

    client.post(
        f"/entities/{setup['entity_id']}/period-locks/close",
        json={"lock_kind": "day", "anchor_date": "2026-03-20"},
        headers=auth_headers(setup["owner"]),
    )

    correct_blocked = client.post(
        f"/entities/{setup['entity_id']}/ledger/entries/{entry_id}/correct",
        json={
            "entry_date": "2026-03-20",
            "description": "Corrected",
            "actor_id": str(setup["cashier"].id),
            "void_date": "2026-03-20",
            "lines": [
                {"account_id": str(bank_id), "amount_kurus": 20000, "side": "debit"},
                {"account_id": str(ap_id), "amount_kurus": 20000, "side": "credit"},
            ],
        },
        headers=auth_headers(setup["cashier"]),
    )
    assert correct_blocked.status_code == 422

    correct_ok = client.post(
        f"/entities/{setup['entity_id']}/ledger/entries/{entry_id}/correct",
        json={
            "entry_date": "2026-03-20",
            "description": "Corrected",
            "actor_id": str(setup["owner"].id),
            "void_date": "2026-03-20",
            "period_unlock_reason": "Month-end correction",
            "lines": [
                {"account_id": str(bank_id), "amount_kurus": 20000, "side": "debit"},
                {"account_id": str(ap_id), "amount_kurus": 20000, "side": "credit"},
            ],
        },
        headers=auth_headers(setup["owner"]),
    )
    assert correct_ok.status_code == 200


def test_reopen_is_audited_and_dirty_flag_set_on_change(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    lock_setup,
) -> None:
    setup = lock_setup
    bank_id = setup["accounts"]["1100"]
    ap_id = setup["accounts"]["2000"]
    locked_day = date(2026, 4, 5)

    close_resp = client.post(
        f"/entities/{setup['entity_id']}/period-locks/close",
        json={"lock_kind": "day", "anchor_date": locked_day.isoformat()},
        headers=auth_headers(setup["owner"]),
    )
    lock_id = close_resp.json()["id"]

    reopen_resp = client.post(
        f"/entities/{setup['entity_id']}/period-locks/{lock_id}/reopen",
        json={"reason": "Accountant review"},
        headers=auth_headers(setup["owner"]),
    )
    assert reopen_resp.status_code == 200

    with entity_context(db_session, setup["entity_id"]):
        reopen_audits = list(
            db_session.scalars(
                select(PeriodLockAuditEvent).where(
                    PeriodLockAuditEvent.action == PeriodLockAuditAction.REOPEN
                )
            )
        )
    assert len(reopen_audits) == 1

    client.post(
        f"/entities/{setup['entity_id']}/manual-journals",
        json=_manual_payload(bank_id, ap_id, setup["owner"].id, locked_day.isoformat()),
        headers=auth_headers(setup["owner"]),
    )

    with entity_context(db_session, setup["entity_id"]):
        lock = db_session.get(PeriodLock, uuid.UUID(lock_id))
    assert lock is not None
    assert lock.dirty is True


def test_created_at_is_timezone_aware_utc(db_session: Session, lock_setup) -> None:
    setup = lock_setup
    bank_id = setup["accounts"]["1100"]
    ap_id = setup["accounts"]["2000"]
    with entity_context(db_session, setup["entity_id"]):
        entry = post_journal_entry(
            db_session,
            setup["entity_id"],
            date(2026, 1, 20),
            "UTC timestamp check",
            [
                PostingLine(bank_id, 5000, AccountNormalBalance.DEBIT),
                PostingLine(ap_id, 5000, AccountNormalBalance.CREDIT),
            ],
            actor_id=setup["owner"].id,
            source=JournalEntrySource.MANUAL,
        )
    assert entry.created_at.tzinfo is not None
    assert entry.created_at.tzinfo == timezone.utc


def test_entry_date_defaults_to_utc_today_when_omitted(
    client: TestClient, lock_setup
) -> None:
    setup = lock_setup
    bank_id = setup["accounts"]["1100"]
    ap_id = setup["accounts"]["2000"]
    payload = _manual_payload(bank_id, ap_id, setup["owner"].id, entry_date=None)
    response = client.post(
        f"/entities/{setup['entity_id']}/manual-journals",
        json=payload,
    )
    assert response.status_code == 201
    assert response.json()["entry_date"] == utc_today().isoformat()


def test_period_locks_cross_entity_isolation(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    restaurant_b,
    lock_setup,
) -> None:
    setup = lock_setup
    _set_go_live(db_session, restaurant_b.id, setup["go_live"])

    close_resp = client.post(
        f"/entities/{setup['entity_id']}/period-locks/close",
        json={"lock_kind": "day", "anchor_date": "2026-01-15"},
        headers=auth_headers(setup["owner"]),
    )
    lock_id = close_resp.json()["id"]

    foreign_list = client.get(
        f"/entities/{restaurant_b.id}/period-locks",
        headers=auth_headers(setup["owner"]),
    )
    assert foreign_list.status_code == 403

    foreign_reopen = client.post(
        f"/entities/{restaurant_b.id}/period-locks/{lock_id}/reopen",
        json={},
        headers=auth_headers(setup["owner"]),
    )
    assert foreign_reopen.status_code in (403, 404)

    accounts_b = _account_ids(db_session, restaurant_b.id)
    stranger = _create_user(db_session, "period-stranger@example.com")
    _add_member(db_session, restaurant_b.id, stranger.id, EntityRole.OWNER)
    post_b = client.post(
        f"/entities/{restaurant_b.id}/manual-journals",
        json=_manual_payload(
            accounts_b["1100"], accounts_b["2000"], stranger.id, "2026-01-15"
        ),
        headers=auth_headers(stranger),
    )
    assert post_b.status_code == 201


def test_close_period_service_direct(db_session: Session, lock_setup) -> None:
    setup = lock_setup
    lock = close_period(
        db_session,
        setup["entity_id"],
        lock_kind=PeriodLockKind.DAY,
        anchor_date=date(2026, 5, 1),
        actor_id=setup["owner"].id,
        reason="EOD close",
    )
    assert lock.period_start == date(2026, 5, 1)
    assert lock.reopened_at is None
