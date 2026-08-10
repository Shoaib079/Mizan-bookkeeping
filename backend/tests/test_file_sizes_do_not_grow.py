"""No new oversized file, and no oversized file gets bigger.

ARCHITECTURE says split past roughly 400 lines. Eighty-four files are already
over, holding 55,777 lines between them, so a guard that simply failed on all
of them would be red forever and get switched off within a week — which is
worse than no guard, because it teaches everyone to ignore a red test.

So this is a ratchet, not a rule. `FILE_SIZE_BASELINE.json` records what each
oversized file measured on 9 August 2026. A file may shrink freely. It may not
grow, and no file may join the list.

**Why it earns its place.** The two files where today's bugs actually lived
are the top two entries: `statements.py` at 3,098 lines and `correction.py`
at 2,427. A missing branch in a 46-branch function is invisible; a missing
branch in a table is a missing row. The splits are real work and they are not
done, but until they are, this stops the problem getting worse — which is the
only thing a guard can honestly do about debt it did not create.

**When it fails, that is the moment to split**, not the moment to raise the
number. Editing the baseline upward is always possible and always a decision:
it should feel like one.
"""

from __future__ import annotations

import json
import pathlib

import pytest

LIMIT = 400

REPO = pathlib.Path(__file__).resolve().parents[2]
BASELINE_PATH = REPO / "FILE_SIZE_BASELINE.json"

#: Where source lives, and what counts as source. Tests are excluded — a long
#: test is usually a thorough one, and the rule is about code that has to be
#: read while something is broken.
ROOTS = (
    ("backend/app", ("*.py",)),
    ("frontend/src", ("*.ts", "*.tsx")),
)


def _measure() -> dict[str, int]:
    sizes: dict[str, int] = {}
    for root, patterns in ROOTS:
        for pattern in patterns:
            for path in (REPO / root).rglob(pattern):
                if ".test." in path.name or "__pycache__" in str(path):
                    continue
                rel = str(path.relative_to(REPO))
                sizes[rel] = len(path.read_text(encoding="utf-8").splitlines())
    return sizes


@pytest.fixture(scope="module")
def sizes() -> dict[str, int]:
    return _measure()


@pytest.fixture(scope="module")
def baseline() -> dict[str, int]:
    return json.loads(BASELINE_PATH.read_text(encoding="utf-8"))


def test_the_scan_finds_the_source_tree(sizes):
    """Guard the guard.

    Over an empty scan every assertion below passes, and the ratchet silently
    stops holding — which is exactly the failure this project keeps producing.
    """
    assert len(sizes) > 500, f"only {len(sizes)} source files found — wrong root?"
    assert any(p.endswith(".py") for p in sizes)
    assert any(p.endswith(".tsx") for p in sizes)


def test_the_baseline_describes_real_files(sizes, baseline):
    """A baseline entry for a file that no longer exists is a free pass.

    Rename a file and its old entry sits there forgiving a size nobody is
    measuring, while the new name is unlisted and unguarded.
    """
    missing = sorted(path for path in baseline if path not in sizes)
    assert missing == [], (
        "these are in FILE_SIZE_BASELINE.json but not in the source tree — "
        "renamed or deleted, so the entry should go too:\n  "
        + "\n  ".join(missing)
    )


def test_no_new_file_goes_over_the_limit(sizes, baseline):
    newly_over = sorted(
        f"{path} ({count} lines)"
        for path, count in sizes.items()
        if count > LIMIT and path not in baseline
    )
    assert newly_over == [], (
        f"these files are new to the wrong side of {LIMIT} lines:\n  "
        + "\n  ".join(newly_over)
        + "\n\nSplit it, or — if that is genuinely the wrong call — add it to "
        "FILE_SIZE_BASELINE.json and say why in the commit."
    )


def test_no_oversized_file_grows(sizes, baseline):
    """The ratchet itself.

    Shrinking is free. Growing is the thing being stopped, because every one
    of these files got here a few lines at a time and nothing ever objected.
    """
    grown = sorted(
        f"{path}: {baseline[path]} → {sizes[path]} (+{sizes[path] - baseline[path]})"
        for path in baseline
        if path in sizes and sizes[path] > baseline[path]
    )
    assert grown == [], (
        "these files are already over the limit and got bigger:\n  "
        + "\n  ".join(grown)
        + "\n\nThis is the moment to split, not the moment to raise the "
        "number. If you raise it, that is a decision worth a sentence in the "
        "commit message."
    )


def test_a_file_that_came_back_under_the_limit_leaves_the_list(sizes, baseline):
    """Otherwise the list only ever grows, and stops meaning anything.

    A file below the limit needs no exemption, and leaving it listed hides
    the progress — the count in the plan is supposed to fall.
    """
    redeemed = sorted(
        f"{path} ({sizes[path]} lines)"
        for path in baseline
        if path in sizes and sizes[path] <= LIMIT
    )
    assert redeemed == [], (
        f"these are back under {LIMIT} lines — remove them from "
        "FILE_SIZE_BASELINE.json:\n  " + "\n  ".join(redeemed)
    )


def test_the_baseline_is_not_quietly_empty(baseline):
    """An emptied baseline would make every test above pass while allowing
    any file to grow to any size."""
    assert len(baseline) > 50, (
        f"the baseline lists only {len(baseline)} files — if that many were "
        "really split, this number should be updated deliberately"
    )
