"""Partner ledger Excel/PDF download endpoints."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.partners import profit_allocation as pa
from app.db.session import entity_context
from app.features.partners.models import Partner


ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _partner_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        partners = []
        for name, pct in [("Ali", "60"), ("Burak", "40")]:
            p = Partner(name=name, ownership_share_pct=Decimal(pct))
            db_session.add(p)
            partners.append(p)
        db_session.commit()
        for p in partners:
            db_session.refresh(p)
    return restaurant_a.id, partners[0]


def test_partner_ledger_export_xlsx_and_pdf(
    db_session, restaurant_a, client: TestClient
) -> None:
    entity_id, partner = _partner_setup(db_session, restaurant_a)
    partner_id = partner.id
    pa.post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 6, 30),
        profit_kurus=100_000,
        description="Export sample",
        actor_id=ACTOR_ID,
        net_against_drawings=False,
        netting_as_of=date(2026, 6, 30),
    )

    xlsx = client.get(
        f"/entities/{entity_id}/partners/{partner_id}/ledger/export"
    )
    assert xlsx.status_code == 200, xlsx.text
    assert "spreadsheetml" in xlsx.headers["content-type"]
    assert xlsx.content[:2] == b"PK"

    pdf = client.get(
        f"/entities/{entity_id}/partners/{partner_id}/ledger/export/pdf"
    )
    assert pdf.status_code == 200, pdf.text
    assert pdf.headers["content-type"].startswith("application/pdf")
    assert pdf.content[:4] == b"%PDF"


def test_partner_ledger_export_missing_partner_404(
    db_session, restaurant_a, client: TestClient
) -> None:
    entity_id = restaurant_a.id
    seed_default_chart(db_session, entity_id)
    missing = uuid.uuid4()
    resp = client.get(
        f"/entities/{entity_id}/partners/{missing}/ledger/export"
    )
    assert resp.status_code == 404
