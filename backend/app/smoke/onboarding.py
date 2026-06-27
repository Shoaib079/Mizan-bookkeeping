"""Owner cold-start API smoke — entity → OB → member → day-one → report."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any, Mapping, Protocol

from app.core.chart_of_accounts.default_chart import DEFAULT_CHART

SMOKE_ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
RENT_EXPENSE_CODE = "5000"
ACCOUNTS_PAYABLE_CODE = "2000"


class SmokeHttpClient(Protocol):
    def request(
        self,
        method: str,
        url: str,
        *,
        json: Any | None = None,
        params: Mapping[str, str] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> Any: ...


class OnboardingSmokeError(Exception):
    """Raised when a smoke step fails."""


@dataclass(frozen=True, slots=True)
class OnboardingSmokeResult:
    entity_id: str
    cash_account_id: str
    member_email: str
    report_net_income_kurus: int


def test_bearer_token(*, clerk_id: str, email: str) -> str:
    return f"test:{clerk_id}:{email}"


def auth_header(bearer_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {bearer_token}"}


def _check_response(response: Any, step: str, *, expected: int = 200) -> dict[str, Any]:
    status = response.status_code
    body_text = getattr(response, "text", "")
    if status != expected:
        raise OnboardingSmokeError(
            f"{step}: HTTP {status} (expected {expected}) — {body_text[:500]}"
        )
    if status == 204:
        return {}
    return response.json()


def run_onboarding_smoke(
    client: SmokeHttpClient,
    *,
    base_url: str = "",
    headers: Mapping[str, str] | None = None,
    entity_name: str = "Mizan Smoke Test Cafe",
    member_email: str = "smoke-staff@example.com",
    post_opening_balances: bool = True,
    go_live_date: date | None = None,
) -> OnboardingSmokeResult:
    """Exercise the owner cold-start path against a live or in-process API."""
    hdrs = dict(headers or {})
    go_live = go_live_date or date.today().replace(day=1)

    prefix = base_url.rstrip("/")

    def url(path: str) -> str:
        return f"{prefix}{path}"

    create = client.request(
        "POST",
        url("/entities"),
        json={"name": entity_name},
        headers=hdrs or None,
    )
    create_body = _check_response(create, "POST /entities", expected=201)
    entity_id = create_body["id"]

    chart = client.request(
        "GET",
        url(f"/entities/{entity_id}/chart-of-accounts"),
        params={"limit": "200"},
        headers=hdrs or None,
    )
    chart_body = _check_response(chart, "GET chart-of-accounts")
    expected_accounts = len(DEFAULT_CHART) + 1
    if chart_body.get("total", 0) < expected_accounts:
        raise OnboardingSmokeError(
            f"chart accounts: expected at least {expected_accounts}, "
            f"got {chart_body.get('total')}"
        )

    money = client.request(
        "GET",
        url(f"/entities/{entity_id}/banking/accounts"),
        headers=hdrs or None,
    )
    money_body = _check_response(money, "GET banking/accounts")
    cash_rows = [
        row for row in money_body.get("items", []) if row.get("account_kind") == "cash"
    ]
    if len(cash_rows) != 1:
        raise OnboardingSmokeError(
            f"cash drawer: expected 1 cash account, got {len(cash_rows)}"
        )
    cash_id = cash_rows[0]["id"]

    ob_lines = [
        {"money_account_id": cash_id, "amount_kurus": 50_000},
        {
            "account_code": ACCOUNTS_PAYABLE_CODE,
            "amount_kurus": 20_000,
            "side": "credit",
        },
    ]
    validate = client.request(
        "POST",
        url(f"/onboarding/entities/{entity_id}/opening-balances/validate"),
        json={"lines": ob_lines},
        headers=hdrs or None,
    )
    validate_body = _check_response(validate, "POST opening-balances/validate")
    if not validate_body.get("valid"):
        raise OnboardingSmokeError("opening balances validate: valid=false")

    if post_opening_balances:
        post = client.request(
            "POST",
            url(f"/onboarding/entities/{entity_id}/opening-balances/post"),
            json={
                "go_live_date": go_live.isoformat(),
                "actor_id": str(SMOKE_ACTOR_ID),
                "lines": ob_lines,
            },
            headers=hdrs or None,
        )
        _check_response(post, "POST opening-balances/post", expected=200)

    member = client.request(
        "POST",
        url(f"/entities/{entity_id}/members"),
        json={
            "email": member_email,
            "display_name": "Smoke Staff",
            "role": "cashier",
        },
        headers=hdrs or None,
    )
    _check_response(member, "POST members", expected=201)

    chart_items = chart_body.get("items") or client.request(
        "GET",
        url(f"/entities/{entity_id}/chart-of-accounts"),
        params={"limit": "200"},
        headers=hdrs or None,
    ).json().get("items", [])
    rent_id = next(
        (row["id"] for row in chart_items if row.get("code") == RENT_EXPENSE_CODE),
        None,
    )
    if rent_id is None:
        raise OnboardingSmokeError(f"expense account {RENT_EXPENSE_CODE} missing from chart")

    expense = client.request(
        "POST",
        url(f"/entities/{entity_id}/expenses"),
        json={
            "expense_date": go_live.isoformat(),
            "amount_kurus": 5_000,
            "expense_account_id": rent_id,
            "money_account_id": cash_id,
            "written_item_description": "smoke test",
            "has_source_document": False,
            "description": "Onboarding smoke expense",
            "actor_id": str(SMOKE_ACTOR_ID),
        },
        headers=hdrs or None,
    )
    _check_response(expense, "POST expenses", expected=201)

    pl = client.request(
        "GET",
        url(f"/entities/{entity_id}/reports/profit-and-loss"),
        params={"from": go_live.isoformat(), "to": go_live.isoformat()},
        headers=hdrs or None,
    )
    pl_body = _check_response(pl, "GET profit-and-loss")
    net = pl_body.get("net_income_kurus")
    if net is None:
        raise OnboardingSmokeError("profit-and-loss: missing net_income_kurus")

    return OnboardingSmokeResult(
        entity_id=entity_id,
        cash_account_id=cash_id,
        member_email=member_email,
        report_net_income_kurus=int(net),
    )
