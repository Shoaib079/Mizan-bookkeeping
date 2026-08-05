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


def test_partner_ledger_download_shows_the_ledger_as_it_now_stands(
    db_session, restaurant_a, client: TestClient
) -> None:
    """A corrected allocation downloads as one row, not three.

    Correcting voids the original and reposts, so `get_partner_ledger` holds
    three rows: the superseded original, the `Void: …` reversal, and the
    replacement. The screen hides the first two behind a history toggle. A
    download has no toggle, and the PDF has no status column either — so an
    unfiltered export reads as three real movements, two of which never
    happened.
    """
    import io

    from openpyxl import load_workbook

    entity_id, partner = _partner_setup(db_session, restaurant_a)
    partner_id = partner.id
    posted = pa.post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 6, 30),
        profit_kurus=100_000,
        description="First figure",
        actor_id=ACTOR_ID,
        net_against_drawings=False,
        netting_as_of=date(2026, 6, 30),
    )
    pa.correct_profit_allocation(
        db_session,
        entity_id,
        posted.journal_entry.id,
        allocation_date=date(2026, 6, 30),
        profit_kurus=250_000,
        description="Corrected figure",
        actor_id=ACTOR_ID,
        net_against_drawings=False,
        netting_as_of=date(2026, 6, 30),
    )

    resp = client.get(f"/entities/{entity_id}/partners/{partner_id}/ledger/export")
    assert resp.status_code == 200, resp.text
    ws = load_workbook(io.BytesIO(resp.content)).active
    descriptions = [
        str(row[2].value)
        for row in ws.iter_rows(min_row=11)
        if row[2].value is not None
    ]

    assert descriptions, "expected at least the surviving allocation row"
    assert not any(d.startswith("Void:") for d in descriptions), descriptions
    assert not any("First figure" in d for d in descriptions), descriptions
    assert any("Corrected figure" in d for d in descriptions), descriptions


def _pdf_text(data: bytes) -> str:
    import io

    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return "".join(page.extract_text() or "" for page in reader.pages)


def test_partner_ledger_pdf_uses_the_shared_report_furniture(
    db_session, restaurant_a, client: TestClient
) -> None:
    """Masthead, KPI strip and footer — not a bare table.

    This export used to hand-roll its own title and a full-grid table, so it
    came out looking like a printout rather than a statement next to the P&L
    and balance sheet. It now builds from header_elements / summary_band /
    _table_style like they do.
    """
    entity_id, partner = _partner_setup(db_session, restaurant_a)
    # Read off the instance before anything commits. Posting the allocation
    # expires it, and touching an attribute afterwards makes SQLAlchemy refresh
    # a row this session can no longer see — ObjectDeletedError, not a real
    # deletion. The other tests in this file capture the id the same way.
    partner_id = partner.id
    partner_name = partner.name
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

    resp = client.get(
        f"/entities/{entity_id}/partners/{partner_id}/ledger/export/pdf"
    )
    assert resp.status_code == 200, resp.text
    # Whitespace-normalised: pypdf's line breaks depend on the layout, and
    # this test is about what the page says, not where it wraps.
    text = " ".join(_pdf_text(resp.content).split())

    # Masthead: titled, attributed, dated.
    assert "Partner ledger" in text
    assert partner_name in text
    assert "As at" in text
    # KPI strip, in the partner page's order.
    for label in ("NET BALANCE", "CAPITAL CONTRIBUTED", "UNPAID PROFIT"):
        assert label in text, f"missing KPI {label!r}"
    # Footer stamp that every other report PDF carries.
    assert "Mizan" in text
    # Dates read the way the app shows them everywhere else, not ISO.
    assert "30.06.2026" in text
    assert "2026-06-30" not in text


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
