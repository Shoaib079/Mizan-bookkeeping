"""The exempt list exists twice, in two languages. They must say the same thing.

`SKIP_PATH_SUFFIXES` in `idempotency/service.py` decides which mutating
endpoints the server lets through without an `Idempotency-Key`.
`EXEMPT_PATH_FRAGMENTS` in `frontend/src/lib/idempotency-coverage.test.ts`
decides which calls the frontend guard stops complaining about. The frontend
copy carries a comment reading *"Kept in step with SKIP_PATH_SUFFIXES"* — and
that comment was the whole enforcement mechanism.

The two directions of drift are not equally bad, which is why this exists:

- Backend exempts something the frontend list does not → the frontend guard
  demands a key the server ignores. Harmless noise.
- **Frontend exempts something the backend does not** → the guard stops
  flagging a call that will 400 the moment it is deployed. Silent, and it
  restores exactly the failure the guard was written for: eleven mutations
  that worked in every environment a developer runs and broke in production.

Cross-language guards read awkwardly. The alternative is a comment, and a
comment is what allowed this.
"""

from __future__ import annotations

import pathlib
import re

from app.core.idempotency.service import SKIP_PATH_SUFFIXES

REPO = pathlib.Path(__file__).resolve().parents[2]
COVERAGE_TEST = REPO / "frontend" / "src" / "lib" / "idempotency-coverage.test.ts"


def _frontend_exempt_fragments() -> list[str]:
    source = COVERAGE_TEST.read_text()
    match = re.search(
        r"const EXEMPT_PATH_FRAGMENTS\s*=\s*\[(.*?)\]", source, re.S
    )
    assert match is not None, (
        f"could not find EXEMPT_PATH_FRAGMENTS in {COVERAGE_TEST} — if it was "
        "renamed, this guard is now blind and must be updated with it"
    )
    return re.findall(r'"([^"]+)"', match.group(1))


def test_the_frontend_file_is_where_we_think_it_is():
    """Guard the guard: a missing file must fail loudly, not vacuously pass."""
    assert COVERAGE_TEST.exists(), f"{COVERAGE_TEST} is gone"


def test_the_scan_finds_a_non_empty_list():
    """An empty parse would make the comparison below trivially true."""
    assert len(_frontend_exempt_fragments()) > 0
    assert len(SKIP_PATH_SUFFIXES) > 0


def test_both_sides_exempt_exactly_the_same_paths():
    frontend = sorted(_frontend_exempt_fragments())
    backend = sorted(SKIP_PATH_SUFFIXES)
    assert frontend == backend, (
        "the two exempt lists have drifted.\n"
        f"  backend  SKIP_PATH_SUFFIXES:     {backend}\n"
        f"  frontend EXEMPT_PATH_FRAGMENTS:  {frontend}\n\n"
        "A path the frontend exempts and the server does not is a call that "
        "returns 400 in production and passes every local check."
    )
