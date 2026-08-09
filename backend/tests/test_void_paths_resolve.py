"""Every void path the ledger hands out points at a route that exists.

Reported: pressing Void on a posted supplier invoice gave "Not Found" — which
is FastAPI's message for an unmatched URL, not one of ours.

`resolve_ledger_entry_actions` returns a `void_path`, the client prefixes it
with `/entities/{id}/` and posts. Three of them carried a `payables/` segment
the payables router does not have — its prefix is `/entities/{entity_id}`, so
the real route is `suppliers/{id}/invoices/{entry}/void`. Voiding a supplier
invoice or a supplier payment from the General ledger had never worked.

It could not be caught anywhere else. The string is assembled in Python,
handed to the browser as data, and only becomes a URL when someone presses a
button — so no import, no type and no route test ever compared the two. This
does, by walking the app's own routing table.
"""

from __future__ import annotations

import re

from app.main import app

#: Mirrors what the client does with `void_path` (see gl-entry-actions.tsx).
CLIENT_PREFIX = "/entities/{entity_id}/"


def _void_path_templates() -> set[str]:
    """The literal `void_path=` strings in entry_actions.py.

    Read from source rather than by calling the resolver: reaching every arm
    would need a posted entry of all twenty-odd sources, and the failure being
    guarded against is a typo in a template, which the source shows directly.
    """
    from pathlib import Path

    source = Path(__file__).resolve().parents[1].joinpath(
        "app", "core", "ledger", "entry_actions.py"
    ).read_text(encoding="utf-8")
    paths = set(re.findall(r'void_path=\(?\s*\n?\s*f?"([^"]+)"', source))
    # `_generic_void_path` builds its own; include what it returns.
    paths.update(re.findall(r'return f"([^"]*/void)"', source))
    return paths


def _registered_void_routes() -> set[str]:
    return {
        _normalise(route.path)
        for route in app.routes
        if getattr(route, "path", "").endswith("/void")
    }


def _normalise(path: str) -> str:
    """Path parameter names differ between the template and the route."""
    return re.sub(r"\{[^}]+\}", "{}", path)


def test_the_scan_finds_both_sides() -> None:
    """Otherwise the assertion below passes by comparing two empty sets."""
    assert len(_void_path_templates()) >= 15
    assert len(_registered_void_routes()) >= 15


def test_every_void_path_matches_a_route() -> None:
    registered = _registered_void_routes()
    missing = sorted(
        path
        for path in _void_path_templates()
        if _normalise(CLIENT_PREFIX + path) not in registered
    )
    assert not missing, (
        "These void paths 404 — the ledger offers a Void button that cannot "
        "work:\n" + "\n".join(missing)
    )


def test_the_supplier_paths_are_the_ones_that_were_wrong() -> None:
    """Named so the fix is not silently undone by a plausible-looking edit."""
    templates = _void_path_templates()
    assert any("suppliers/" in p and "/invoices/" in p for p in templates)
    assert not any(p.startswith("payables/") for p in templates), (
        "the payables router's prefix is /entities/{entity_id}, with no "
        "payables segment"
    )
