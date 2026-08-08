"""A future-dated invoice is a misread, and must not post itself.

The case that prompted this: a TT Mobil e-Fatura whose document reads
"Fatura Tarihi: 31-07-2026" was read as 16.09.2026 — six weeks ahead — and
auto-posted. Right supplier, right money, wrong date.

That combination is the worst of the extraction failures, because it hides
its own evidence. A wrong amount shows up in a balance someone checks. A
wrong *date* posts the correct amount into a period nobody is looking at, and
every screen that would help you find it is filtered by date. The invoice was
in payables and nowhere else, and re-uploading only said it already existed.

So the rule is not "parse better" — that is a separate, endless job. The rule
is that a date after today never posts unattended, and says why.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.features.invoices.one_click_post import is_future_dated

TODAY = date(2026, 8, 8)


def test_today_is_not_future():
    """The boundary, in the direction that matters: an invoice issued this
    morning must still post."""
    assert is_future_dated(TODAY, today=TODAY) is False


def test_yesterday_is_not_future():
    assert is_future_dated(TODAY - timedelta(days=1), today=TODAY) is False


def test_tomorrow_is_future():
    assert is_future_dated(TODAY + timedelta(days=1), today=TODAY) is True


def test_the_real_case_is_caught():
    """31-07-2026 on the document, read as 16.09.2026, uploaded on 08.08."""
    assert is_future_dated(date(2026, 9, 16), today=TODAY) is True
    assert is_future_dated(date(2026, 7, 31), today=TODAY) is False


def test_a_month_old_invoice_still_posts():
    """The ordinary case must not be caught by the guard: last month's
    invoices are uploaded at the start of this one."""
    assert is_future_dated(date(2026, 7, 31), today=TODAY) is False


def _upload(client: TestClient, entity_id, content: bytes, name="sample.xml"):
    return client.post(
        f"/entities/{entity_id}/invoices/efatura/draft",
        files={"file": (name, content, "application/xml")},
    )


def test_a_future_dated_upload_says_so_on_the_row(
    restaurant_a, client: TestClient, monkeypatch
):
    """The reason belongs on the invoice, not left to be worked out from an
    empty list."""
    from pathlib import Path

    from app.features.invoices import service as invoice_service

    fixture = (
        Path(__file__).resolve().parent / "fixtures" / "efatura" / "sample.xml"
    )
    monkeypatch.setattr(
        invoice_service, "is_future_dated", lambda _date: True
    )
    resp = _upload(client, restaurant_a.id, fixture.read_bytes())
    assert resp.status_code == 201, resp.text
    reason = resp.json()["review_reason"] or ""
    assert "future" in reason.lower(), reason
    assert "before posting" in reason.lower(), reason
