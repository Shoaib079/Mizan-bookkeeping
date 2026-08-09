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
    """Registered paths, read from the OpenAPI schema.

    Not by walking `app.routes`. That list is not flat in every FastAPI
    version — newer ones keep an included router's paths nested behind a
    wrapper object whose own `path` is `None`, so the obvious scan finds no
    routes at all and every void path looks broken. The schema is the app's
    own answer to "what URLs exist", and it is stable across versions.
    """
    return {
        _normalise(path)
        for path in app.openapi()["paths"]
        if path.endswith("/void")
    }


def _normalise(path: str) -> str:
    """Path parameter names differ between the template and the route."""
    return re.sub(r"\{[^}]+\}", "{}", path)


def test_the_scan_finds_both_sides() -> None:
    """Otherwise the assertion below passes by comparing two empty sets — or
    fails claiming every path is broken.

    Both counts are in the message on purpose. The first version of this file
    read `app.routes` and found nothing, so it reported nineteen 404s that did
    not exist; "assert 0 >= 15" said which number was zero but not which of
    the two it belonged to.
    """
    templates = _void_path_templates()
    routes = _registered_void_routes()
    assert len(templates) >= 15, (
        f"only {len(templates)} void_path templates found in entry_actions.py "
        "— the scan is looking in the wrong place or the format changed"
    )
    assert len(routes) >= 15, (
        f"only {len(routes)} /void routes found in the OpenAPI schema — the "
        "scan is broken, not the app"
    )


def test_every_void_path_matches_a_route() -> None:
    registered = _registered_void_routes()
    templates = _void_path_templates()
    missing = sorted(
        path
        for path in templates
        if _normalise(CLIENT_PREFIX + path) not in registered
    )
    assert not missing, (
        f"These void paths 404 — the ledger offers a Void button that cannot "
        f"work ({len(templates)} templates against {len(registered)} routes):\n"
        + "\n".join(missing)
    )


def test_the_supplier_paths_are_the_ones_that_were_wrong() -> None:
    """Named so the fix is not silently undone by a plausible-looking edit."""
    templates = _void_path_templates()
    assert any("suppliers/" in p and "/invoices/" in p for p in templates)
    assert not any(p.startswith("payables/") for p in templates), (
        "the payables router's prefix is /entities/{entity_id}, with no "
        "payables segment"
    )
