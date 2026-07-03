"""Review queue counts API — aligned with Review hub tabs."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.core.chart_of_accounts.seed import seed_default_chart
from app.db.session import entity_context
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceSourceType
from app.features.review_counts import service as review_counts_service

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def review_counts_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    return restaurant_a.id


def test_review_counts_empty(db_session, review_counts_setup) -> None:
    counts = review_counts_service.get_review_counts(db_session, review_counts_setup)
    assert counts.total == 0
    assert counts.by_tab.invoices == 0


def test_review_counts_includes_pending_and_confirmed_invoices(
    db_session, review_counts_setup
) -> None:
    with entity_context(db_session, review_counts_setup):
        db_session.add(
            InvoiceDraft(
                status=InvoiceDraftStatus.NEEDS_REVIEW.value,
                source_type=InvoiceSourceType.EFATURA_XML,
                file_fingerprint="rc-needs-review",
                invoice_number="INV-NR-1",
                invoice_date=date(2026, 6, 1),
                net_kurus=100_000,
                gross_kurus=120_000,
                vat_breakdown=[
                    {"rate_percent": 20, "base_kurus": 100_000, "vat_kurus": 20_000},
                ],
                currency="TRY",
                extraction_payload={},
            )
        )
        db_session.add(
            InvoiceDraft(
                status=InvoiceDraftStatus.CONFIRMED.value,
                source_type=InvoiceSourceType.EFATURA_XML,
                file_fingerprint="rc-confirmed",
                invoice_number="INV-CF-1",
                invoice_date=date(2026, 6, 2),
                net_kurus=200_000,
                gross_kurus=240_000,
                vat_breakdown=[
                    {"rate_percent": 20, "base_kurus": 200_000, "vat_kurus": 40_000},
                ],
                currency="TRY",
                extraction_payload={},
                confirmed_by=ACTOR_ID,
            )
        )
        db_session.commit()

    counts = review_counts_service.get_review_counts(db_session, review_counts_setup)
    assert counts.invoices_pending == 1
    assert counts.invoices_ready_to_post == 1
    assert counts.by_tab.invoices == 2
    assert counts.total == 2


def test_review_counts_api(client: TestClient, review_counts_setup) -> None:
    response = client.get(f"/entities/{review_counts_setup}/review-counts")
    assert response.status_code == 200
    body = response.json()
    assert "total" in body
    assert "by_tab" in body
    assert set(body["by_tab"].keys()) == {
        "bank",
        "sales",
        "receipts",
        "invoices",
        "delivery",
    }
