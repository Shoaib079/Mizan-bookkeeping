"""AI fallback for expense account suggestion from free text."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
import uuid
from typing import Any

from app.config import settings
from app.core.chart_of_accounts.models import Account
from app.core.expenses.account_learning import ExpenseAccountSuggestion


class ExpenseAccountSuggestError(ValueError):
    """AI expense account suggestion failed."""


def suggest_expense_account_via_ai(
    description: str,
    expense_accounts: list[Account],
) -> ExpenseAccountSuggestion | None:
    """Pick best-fit expense account code via configured vision/OpenAI endpoint."""
    url = settings.expense_receipt_vision_url
    if not url or not expense_accounts:
        return None

    account_lines = [
        f"{account.code}: {account.name_en} / {account.name_tr}"
        for account in expense_accounts
    ]
    body = json.dumps(
        {
            "model": settings.expense_receipt_vision_model,
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "Pick the single best expense account for this restaurant "
                        "expense description. Return strict JSON only: "
                        '{"account_code": "5200", "confidence": "high|medium|low"}. '
                        "Use only account codes from this list:\n"
                        + "\n".join(account_lines)
                        + f"\n\nDescription: {description.strip()}"
                    ),
                }
            ],
            "response_format": {"type": "json_object"},
        }
    ).encode("utf-8")

    headers = {"Content-Type": "application/json"}
    if settings.expense_receipt_vision_api_key:
        headers["Authorization"] = f"Bearer {settings.expense_receipt_vision_api_key}"

    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw: dict[str, Any] = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
        raise ExpenseAccountSuggestError(f"AI suggestion request failed: {exc}") from exc

    content = raw.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not content:
        return None
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ExpenseAccountSuggestError("AI suggestion returned invalid JSON") from exc

    code = str(parsed.get("account_code", "")).strip()
    if not code:
        return None

    match = next((account for account in expense_accounts if account.code == code), None)
    if match is None:
        return None

    confidence = str(parsed.get("confidence", "medium")).lower()
    if confidence not in {"high", "medium", "low"}:
        confidence = "medium"

    return ExpenseAccountSuggestion(
        account_id=match.id,
        source="ai",
        confidence=confidence,  # type: ignore[arg-type]
    )
