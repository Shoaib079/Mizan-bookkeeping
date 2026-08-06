"""Draft a dish description from its name, in English and Turkish.

Writing eleven menus' worth of descriptions by hand is the tedious part of
replacing the Word file, and the app knows what Dal Tadka is. So it offers a
draft.

**A draft, never a saving.** Nothing is written to a dish without the user
pressing save, because a model that has never eaten in this kitchen should not
be describing its food unchallenged — "or similar" appears a dozen times on
these menus precisely because the dish varies. The button fills the boxes; the
person decides.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from app.config import settings


class DishDescriptionError(ValueError):
    """Drafting a description failed."""


@dataclass(frozen=True)
class DishDescriptionDraft:
    description: str
    description_tr: str


def draft_dish_description(name: str) -> DishDescriptionDraft | None:
    """Suggest an English and Turkish description, or None if unavailable.

    Returns None rather than raising when no AI endpoint is configured — the
    feature is a convenience, and a restaurant without it should still be able
    to add dishes.
    """
    url = settings.expense_receipt_vision_url
    cleaned = name.strip()
    if not url or not cleaned:
        return None

    body = json.dumps(
        {
            "model": settings.expense_receipt_vision_model,
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "You are writing a menu for an Indian restaurant in "
                        "Istanbul. Its group menus go to tourism agencies, who "
                        "pass them to travellers deciding what to book.\n\n"
                        "Describe this dish in one short sentence — the main "
                        "ingredients and how it is cooked. No marketing "
                        "language, no exclamation marks, no price, no "
                        "allergen advice. Around 12 words. If the dish is "
                        "unfamiliar, describe what the name literally means "
                        "rather than inventing detail.\n\n"
                        "Return strict JSON only: "
                        '{"description": "...", "description_tr": "..."} '
                        "where description is English and description_tr is "
                        "the same sentence in Turkish.\n\n"
                        f"Dish: {cleaned}"
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
        raise DishDescriptionError(f"Description request failed: {exc}") from exc

    content = raw.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not content:
        return None
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise DishDescriptionError("Description returned invalid JSON") from exc

    english = str(parsed.get("description", "")).strip()
    turkish = str(parsed.get("description_tr", "")).strip()
    if not english and not turkish:
        return None
    # Trimmed to the column width rather than rejected: a slightly long draft
    # is still a useful starting point, and the person is about to edit it.
    return DishDescriptionDraft(
        description=english[:1024],
        description_tr=turkish[:1024],
    )
