"""Every URL the frontend builds points at a route that exists.

`test_void_paths_resolve.py` does this for the one family of URLs the backend
hands out as data. Every other URL in the app is assembled in a React component
and only becomes a request when someone presses a button — so `tsc` cannot see
it, no route test compares it, and a typo surfaces as FastAPI's "Not Found",
which reads like missing data rather than a broken link.

That is how three void paths carried a `payables/` segment no router has, and
how a Void button on supplier invoices never worked. The same gap covers the
correction endpoints behind every Edit form, which is what this was written
for; scoping it to edits only would have left the rest of the surface exactly
as unguarded as the void paths were.

Scoped to `/entities/…` on purpose. Those are unambiguously API calls — a
Next.js page route never carries an entity id — so the scan needs no list of
which strings are URLs and which are something else.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.main import app

FRONTEND_SRC = Path(__file__).resolve().parents[2] / "frontend" / "src"

#: A quoted string starting with a slash, in any of the three quote styles.
_LITERAL = re.compile(r"""[`"']((?:/entities)[^`"'\s]*)[`"']""")

#: `${...}` in a template literal, and `{...}` in an OpenAPI path.
_PLACEHOLDER = re.compile(r"\$\{[^}]*\}|\{[^}]*\}")

#: Literals that cannot be checked because a whole path segment arrives at
#: runtime — two interpolations with no `/` between them, so the string is a
#: prefix plus "whatever the caller passes".
#:
#: These are the generic helpers: a subledger page that takes `ledgerPath`, a
#: list hook that takes `LIST_PATH[kind]`. The path they end up with is checked
#: wherever it is *defined*, if it is defined as a literal there.
_ASSEMBLED_AT_RUNTIME = re.compile(r"\}\$\{")

#: Literals where the last segment is a variable holding a whole path, so the
#: `}${` rule above does not see it — there is a `/` in between.
#:
#: Both are checked, not waved through: the reason is recorded here and
#: `test_the_exemptions_are_still_needed` fails if one of them starts resolving
#: on its own, so this cannot quietly become a list of free passes.
#:
#: There were three call sites writing the first template inline — the General
#: ledger, the customer page and the partner page — which is three literals to
#: exempt and three chances to miss one. They now share `entityPath()`, so the
#: template exists once and this list names one place rather than three.
_CHECKED_ELSEWHERE = {
    "/entities/${entityId}/${backendPath}": (
        "`entityPath()` in lib/api.ts, which every caller of a backend-supplied "
        "path goes through. The paths themselves — void_path and its kin — are "
        "checked against the routing table by test_void_paths_resolve.py, "
        "which is where that family belongs"
    ),
    "/entities/${entityId}/partners/${partnerId}/${path}": (
        "path is one of three literals assigned immediately above the call; "
        "all three are checked by test_the_partner_movement_paths_resolve"
    ),
}

#: The three values `${path}` can take in partner-record-form.tsx.
_PARTNER_MOVEMENT_PATHS = (
    "/entities/{}/partners/{}/capital-contributions",
    "/entities/{}/partners/{}/profit-payments",
    "/entities/{}/partners/{}/drawing-repayments",
)


def _normalise(path: str) -> str:
    """One shape for both sides: placeholder names differ, values do not."""
    return _PLACEHOLDER.sub("{}", path.split("?")[0]).rstrip("/")


def _client_paths() -> dict[str, set[str]]:
    """Every `/entities/...` literal in the frontend, with where it came from."""
    found: dict[str, set[str]] = {}
    for path in FRONTEND_SRC.rglob("*"):
        if path.suffix not in (".ts", ".tsx") or ".test." in path.name:
            continue
        source = path.read_text(encoding="utf-8")
        for match in _LITERAL.finditer(source):
            literal = match.group(1)
            if _ASSEMBLED_AT_RUNTIME.search(literal) or literal in _CHECKED_ELSEWHERE:
                continue
            found.setdefault(literal, set()).add(
                str(path.relative_to(FRONTEND_SRC.parents[1]))
            )
    return found


def _registered_paths() -> set[str]:
    """Registered routes, from the OpenAPI schema rather than `app.routes`.

    `app.routes` is not flat in every FastAPI version — an included router's
    paths sit behind a wrapper whose own `path` is `None`, so the obvious scan
    finds nothing and reports the entire app as broken. This mistake has been
    made once already in `test_void_paths_resolve.py`.
    """
    return {_normalise(path) for path in app.openapi()["paths"]}


def test_the_scan_finds_both_sides() -> None:
    """Guard the guard.

    Over an empty set on either side the assertion below is vacuous, or fails
    claiming every URL in the app is broken. Both counts are in the message so
    a failure says which side is zero.
    """
    client = _client_paths()
    registered = _registered_paths()
    assert len(client) >= 100, (
        f"only {len(client)} /entities literals found under {FRONTEND_SRC} — "
        "the scan is looking in the wrong place or the quoting changed"
    )
    assert len(registered) >= 100, (
        f"only {len(registered)} routes in the OpenAPI schema — the scan is "
        "broken, not the app"
    )


def test_every_client_path_matches_a_route() -> None:
    registered = _registered_paths()
    client = _client_paths()
    missing = {
        literal: sorted(files)
        for literal, files in client.items()
        if _normalise(literal) not in registered
    }
    assert not missing, (
        f"These URLs 404 — a button that cannot work "
        f"({len(client)} client paths against {len(registered)} routes):\n"
        + "\n".join(
            f"  {literal}\n      {', '.join(files)}"
            for literal, files in sorted(missing.items())
        )
    )


def test_the_partner_movement_paths_resolve() -> None:
    """The three branches of `${path}` in partner-record-form.tsx.

    Recording a capital contribution, a profit payment or a drawing repayment
    each posts to a different URL chosen by a ternary. The scan sees one
    template with a variable on the end; these are what it stands for.
    """
    registered = _registered_paths()
    missing = [path for path in _PARTNER_MOVEMENT_PATHS if path not in registered]
    assert not missing, f"partner movement URLs that 404: {missing}"


def test_the_exemptions_are_still_needed() -> None:
    """An exemption for a path that now resolves is a free pass.

    Both entries are skipped before the comparison, so nothing else would ever
    notice if one became an ordinary checkable literal — it would sit in the
    list forgiving something that no longer needs forgiving, which is exactly
    how the file-size baseline was going wrong.
    """
    registered = _registered_paths()
    client_source = "".join(
        path.read_text(encoding="utf-8")
        for path in FRONTEND_SRC.rglob("*")
        if path.suffix in (".ts", ".tsx") and ".test." not in path.name
    )
    for literal, reason in _CHECKED_ELSEWHERE.items():
        assert literal in client_source, (
            f"exempted path is no longer in the frontend, drop it: {literal}"
        )
        assert _normalise(literal) not in registered, (
            f"this resolves on its own now — remove the exemption ({reason}): "
            f"{literal}"
        )


def test_the_correction_endpoints_are_covered() -> None:
    """The reason this file exists: Edit posts to a correction route.

    Thirteen of the fourteen edit kinds open a form from the General ledger,
    each posting somewhere different. Named here so that a scan which quietly
    stops matching them still fails, rather than passing over zero of the
    paths it was written to check.
    """
    correcting = [p for p in _client_paths() if p.endswith("/correct")]
    assert len(correcting) >= 8, (
        f"only {len(correcting)} correction endpoints found in the frontend — "
        "the Edit forms are the thing this test is for"
    )
