"""Delivery platform reports and settlements (Phase 6 Slice 2)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.delivery import posting as delivery_posting
from app.core.ledger.models import JournalEntryLine, JournalEntrySource
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.delivery.models import DeliveryReportStatus
from app.features.delivery.schema import (
    DeliveryReportCreate,
    DeliveryReportPostRequest,
    DeliverySettlementCreate,
)
from app.features.delivery import service as delivery_service
from app.features.delivery.settings import DeliveryNotEnabledError
from tests.delivery_helpers import ACTOR_ID, delivery_setup as build_delivery_setup


@pytest.fixture
def delivery_setup(db_session, restaurant_a):
    setup = build_delivery_setup(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        setup["accounts"] = {a.code: a.id for a in db_session.scalars(select(Account))}
    setup["getir"] = setup["platforms"]["Getir"]
    return setup


def test_delivery_report_posts_dr_clearing_cr_revenue(db_session, delivery_setup) -> None:
    entity_id = delivery_setup["entity_id"]
    clearing_id = delivery_setup["getir"].gl_account_id
    revenue_id = delivery_setup["accounts"][SALES_REVENUE_CODE]

    created = delivery_service.create_delivery_report(
        db_session,
        entity_id,
        DeliveryReportCreate(
            delivery_platform_id=delivery_setup["getir"].id,
            report_date=date(2026, 3, 1),
            gross_kurus=500_000,
            commission_kurus=75_000,
            net_kurus=425_000,
            description="Getir March 1 report",
            actor_id=ACTOR_ID,
        ),
    )
    assert created.status == DeliveryReportStatus.DRAFT.value

    posted = delivery_service.post_delivery_report_intake(
        db_session,
        entity_id,
        created.id,
        DeliveryReportPostRequest(actor_id=ACTOR_ID),
    )
    assert posted.status == DeliveryReportStatus.POSTED.value
    assert posted.journal_entry_id is not None

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == posted.journal_entry_id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert by_account[clearing_id].amount_kurus == 500_000
    assert by_account[clearing_id].side == AccountNormalBalance.DEBIT
    assert by_account[revenue_id].amount_kurus == 500_000
    assert by_account[revenue_id].side == AccountNormalBalance.CREDIT


def test_math_mismatch_creates_needs_review(db_session, delivery_setup) -> None:
    entity_id = delivery_setup["entity_id"]

    created = delivery_service.create_delivery_report(
        db_session,
        entity_id,
        DeliveryReportCreate(
            delivery_platform_id=delivery_setup["getir"].id,
            report_date=date(2026, 3, 2),
            gross_kurus=500_000,
            commission_kurus=75_000,
            net_kurus=400_000,
            description="Bad math report",
            actor_id=ACTOR_ID,
        ),
    )
    assert created.status == DeliveryReportStatus.NEEDS_REVIEW.value
    assert created.review_reason is not None

    with pytest.raises(delivery_posting.InvalidDeliveryReportError):
        delivery_service.post_delivery_report_intake(
            db_session,
            entity_id,
            created.id,
            DeliveryReportPostRequest(actor_id=ACTOR_ID),
        )


def test_delivery_not_enabled_rejected(db_session, restaurant_a) -> None:
    seed_default_chart(db_session, restaurant_a.id)

    with pytest.raises(DeliveryNotEnabledError):
        delivery_service.create_delivery_report(
            db_session,
            restaurant_a.id,
            DeliveryReportCreate(
                delivery_platform_id=uuid.uuid4(),
                report_date=date(2026, 3, 1),
                gross_kurus=100_000,
                commission_kurus=10_000,
                net_kurus=90_000,
                description="No delivery module",
                actor_id=ACTOR_ID,
            ),
        )


def test_duplicate_fingerprint_rejected(db_session, delivery_setup) -> None:
    entity_id = delivery_setup["entity_id"]
    payload = DeliveryReportCreate(
        delivery_platform_id=delivery_setup["getir"].id,
        report_date=date(2026, 3, 3),
        gross_kurus=200_000,
        commission_kurus=20_000,
        net_kurus=180_000,
        description="First",
        actor_id=ACTOR_ID,
    )
    delivery_service.create_delivery_report(db_session, entity_id, payload)

    with pytest.raises(delivery_service.DuplicateDeliveryReportError):
        delivery_service.create_delivery_report(db_session, entity_id, payload)


def test_settlement_credits_clearing(db_session, delivery_setup) -> None:
    entity_id = delivery_setup["entity_id"]
    bank = delivery_setup["bank"]
    clearing_id = delivery_setup["getir"].gl_account_id

    created = delivery_service.create_delivery_report(
        db_session,
        entity_id,
        DeliveryReportCreate(
            delivery_platform_id=delivery_setup["getir"].id,
            report_date=date(2026, 3, 4),
            gross_kurus=300_000,
            commission_kurus=30_000,
            net_kurus=270_000,
            description="Getir report",
            actor_id=ACTOR_ID,
        ),
    )
    delivery_service.post_delivery_report_intake(
        db_session,
        entity_id,
        created.id,
        DeliveryReportPostRequest(actor_id=ACTOR_ID),
    )

    result = delivery_posting.post_delivery_settlement(
        db_session,
        entity_id,
        delivery_platform_id=delivery_setup["getir"].id,
        money_account_id=bank.id,
        settlement_date=date(2026, 3, 8),
        amount_kurus=270_000,
        description="Getir payout",
        actor_id=ACTOR_ID,
    )

    assert result.journal_entry.source == JournalEntrySource.DELIVERY_SETTLEMENT

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry.id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert by_account[bank.gl_account_id].side == AccountNormalBalance.DEBIT
    assert by_account[clearing_id].amount_kurus == 270_000
    assert by_account[clearing_id].side == AccountNormalBalance.CREDIT

    with entity_context(db_session, entity_id):
        balance = banking_service.gl_balance_kurus(
            db_session, clearing_id, AccountNormalBalance.DEBIT
        )
    assert balance == 30_000


def test_clearing_reconciliation(db_session, delivery_setup) -> None:
    entity_id = delivery_setup["entity_id"]
    bank = delivery_setup["bank"]

    created = delivery_service.create_delivery_report(
        db_session,
        entity_id,
        DeliveryReportCreate(
            delivery_platform_id=delivery_setup["getir"].id,
            report_date=date(2026, 3, 5),
            gross_kurus=400_000,
            commission_kurus=40_000,
            net_kurus=360_000,
            description="Getir",
            actor_id=ACTOR_ID,
        ),
    )
    delivery_service.post_delivery_report_intake(
        db_session,
        entity_id,
        created.id,
        DeliveryReportPostRequest(actor_id=ACTOR_ID),
    )

    delivery_service.create_delivery_settlement(
        db_session,
        entity_id,
        DeliverySettlementCreate(
            delivery_platform_id=delivery_setup["getir"].id,
            money_account_id=bank.id,
            settlement_date=date(2026, 3, 10),
            amount_kurus=360_000,
            description="Payout",
            actor_id=ACTOR_ID,
        ),
    )

    recon = delivery_service.get_delivery_clearing_reconciliation(db_session, entity_id)
    getir = next(
        p for p in recon.platforms if p.delivery_platform_id == delivery_setup["getir"].id
    )
    assert getir.total_reported_gross_kurus == 400_000
    assert getir.total_settled_net_kurus == 360_000
    assert getir.in_transit_kurus == 40_000
    assert getir.clearing_balance_kurus == 40_000


def test_cross_entity_isolation(db_session, restaurant_a, restaurant_b) -> None:
    setup_a = build_delivery_setup(db_session, restaurant_a.id, platform_names=("Getir",))

    created = delivery_service.create_delivery_report(
        db_session,
        restaurant_a.id,
        DeliveryReportCreate(
            delivery_platform_id=setup_a["platforms"]["Getir"].id,
            report_date=date(2026, 3, 6),
            gross_kurus=100_000,
            commission_kurus=10_000,
            net_kurus=90_000,
            description="A only",
            actor_id=ACTOR_ID,
        ),
    )

    with pytest.raises(LookupError):
        delivery_service.get_delivery_report(db_session, restaurant_b.id, created.id)


def test_delivery_reports_api_e2e(client: TestClient, db_session, delivery_setup) -> None:
    entity_id = delivery_setup["entity_id"]
    bank = delivery_setup["bank"]
    getir_id = str(delivery_setup["getir"].id)

    create_resp = client.post(
        f"/entities/{entity_id}/delivery/reports",
        json={
            "delivery_platform_id": getir_id,
            "report_date": "2026-03-07",
            "gross_kurus": 250_000,
            "commission_kurus": 25_000,
            "net_kurus": 225_000,
            "description": "API report",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert create_resp.status_code == 201
    report_id = create_resp.json()["id"]

    post_resp = client.post(
        f"/entities/{entity_id}/delivery/reports/{report_id}/post",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert post_resp.status_code == 200
    assert post_resp.json()["status"] == "posted"

    settle_resp = client.post(
        f"/entities/{entity_id}/delivery/settlements",
        json={
            "delivery_platform_id": getir_id,
            "money_account_id": str(bank.id),
            "settlement_date": "2026-03-12",
            "amount_kurus": 225_000,
            "description": "API payout",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert settle_resp.status_code == 201

    recon_resp = client.get(
        f"/entities/{entity_id}/delivery/clearing-reconciliation",
    )
    assert recon_resp.status_code == 200
    assert len(recon_resp.json()["platforms"]) == 3

    dup_resp = client.post(
        f"/entities/{entity_id}/delivery/reports",
        json={
            "delivery_platform_id": getir_id,
            "report_date": "2026-03-07",
            "gross_kurus": 250_000,
            "commission_kurus": 25_000,
            "net_kurus": 225_000,
            "description": "Duplicate",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert dup_resp.status_code == 409


def test_classify_statement_delivery_settlement(
    client: TestClient, db_session, delivery_setup
) -> None:
    entity_id = delivery_setup["entity_id"]
    bank = delivery_setup["bank"]
    getir_id = str(delivery_setup["getir"].id)

    csv_content = (
        "transaction_date,amount_kurus,description,reference\n"
        "2026-03-15,225000,Getir payout,GETIR-001\n"
    ).encode()

    import_resp = client.post(
        f"/entities/{entity_id}/banking/accounts/{bank.id}/statements",
        files={"file": ("stmt.csv", csv_content, "text/csv")},
    )
    assert import_resp.status_code == 201
    statement_id = import_resp.json()["id"]
    line_id = import_resp.json()["lines"][0]["id"]

    classify_resp = client.patch(
        f"/entities/{entity_id}/banking/statements/{statement_id}/lines/{line_id}/classify",
        json={
            "classification": "delivery_settlement",
            "delivery_platform_id": getir_id,
            "actor_id": str(ACTOR_ID),
        },
    )
    assert classify_resp.status_code == 200
    assert classify_resp.json()["line"]["delivery_settlement_id"] is not None
    assert classify_resp.json()["journal_entry_id"] is not None
