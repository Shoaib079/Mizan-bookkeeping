"""`correction` keeps offering exactly what the rest of the app imports.

`correction.py` is 2,427 lines and is about to become a package. Splitting it
is a pure move — no behaviour changes, no renames — and this is what makes
"pure" checkable rather than merely intended.

Thirty-nine names are imported from it across thirty-seven files. That set is
the contract. If a name is dropped, renamed, or ends up with different
parameters on its way into a new module, this fails and names it. Without
that, a transcription slip in a 2,400-line move surfaces the next time
someone voids a supplier payment.

The parameter lists matter as much as the names. Most of these take
keyword-only arguments — `actor_id`, `reason`, `void_date` — and a move that
silently reordered or renamed one would still import, still call, and still
be wrong. Two of today's bugs were exactly that shape: something that looked
right and pointed at the wrong thing.

**This baseline is not permanent.** Once the split has landed and settled,
narrowing the surface is a fine thing to do — but deliberately, by editing
this file in its own commit, not as a side effect of moving code.
"""

from __future__ import annotations

import inspect
import json
import pathlib

import pytest

from app.core.ledger import correction

BASELINE = pathlib.Path(__file__).with_name("correction_surface_baseline.json")


def _baseline() -> dict[str, dict]:
    return json.loads(BASELINE.read_text(encoding="utf-8"))


def test_the_baseline_is_not_empty():
    """Guard the guard — an emptied baseline would let the split drop
    everything while every assertion below passed."""
    surface = _baseline()
    assert len(surface) >= 39, f"baseline lists only {len(surface)} names"
    assert any(v["kind"] == "function" for v in surface.values())
    assert any(v["kind"] == "class" for v in surface.values())
    assert any(v["kind"] == "value" for v in surface.values())


@pytest.mark.parametrize("name", sorted(_baseline()))
def test_the_name_is_still_there(name: str):
    assert hasattr(correction, name), (
        f"`{name}` is imported elsewhere in the app and `correction` no longer "
        "offers it. If the split moved it, re-export it from "
        "correction/__init__.py."
    )


@pytest.mark.parametrize(
    "name,expected", sorted(_baseline().items())
)
def test_it_is_still_the_same_kind_of_thing(name: str, expected: dict):
    """A function replaced by a constant of the same name imports fine and
    fails at the call, which is a long way from here."""
    attr = getattr(correction, name)
    if expected["kind"] == "class":
        assert inspect.isclass(attr), f"{name} is no longer a class"
    elif expected["kind"] == "function":
        assert callable(attr), f"{name} is no longer callable"


@pytest.mark.parametrize(
    "name,expected",
    sorted(
        (n, v) for n, v in _baseline().items() if v["kind"] == "function"
    ),
)
def test_the_parameters_are_unchanged(name: str, expected: dict):
    """Names and order both.

    A move that renamed `void_date` or swapped two positional arguments would
    still import and still run. `reason` and `void_date` are adjacent
    optionals on most of these — the sort of pair that survives a careless
    reorder and produces a reversal dated wrong.
    """
    signature = inspect.signature(getattr(correction, name))
    actual: list[str] = []
    seen_kwonly = False
    for parameter in signature.parameters.values():
        if parameter.kind is inspect.Parameter.KEYWORD_ONLY and not seen_kwonly:
            actual.append("*")
            seen_kwonly = True
        actual.append(parameter.name)

    assert actual == expected["params"], (
        f"`{name}` takes different parameters than before the split:\n"
        f"  was: {expected['params']}\n"
        f"  now: {actual}"
    )
