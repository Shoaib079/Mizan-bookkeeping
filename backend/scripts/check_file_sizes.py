#!/usr/bin/env python3
"""Run the file-size ratchet without a database.

`tests/test_file_sizes_do_not_grow.py` checks six things, and for a whole day
I checked one of them — "did anything grow?" — with a one-liner, and reported
"ratchet clean" a dozen times. CI then failed on a different direction: a file
had come back *under* the limit and still sat in the baseline. A check narrower
than the thing it claims to verify is the fault this project keeps repeating,
and resolving to be more careful is not a fix.

So this runs the real test functions rather than reimplementing them. It
imports the module, builds the same two fixtures by hand and calls every
`test_*` in it. There is nothing here to drift: adding a seventh check to the
test adds it here.

Why a script at all — the suite needs Postgres and Python 3.11, and this one
test needs neither. It should be runnable anywhere, in a second, so that
running it is never the expensive option.

    python3 backend/scripts/check_file_sizes.py
"""

from __future__ import annotations

import importlib.util
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve()
TEST_PATH = HERE.parents[1] / "tests" / "test_file_sizes_do_not_grow.py"


def _load():
    spec = importlib.util.spec_from_file_location("_file_size_ratchet", TEST_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    module = _load()
    # The fixtures, made plainly. `sizes` and `baseline` are the only two, and
    # both are module-scoped and free of pytest machinery.
    import json

    sizes = module._measure()
    baseline = json.loads(module.BASELINE_PATH.read_text(encoding="utf-8"))
    available = {"sizes": sizes, "baseline": baseline}

    checks = sorted(
        name for name in dir(module) if name.startswith("test_")
    )
    if not checks:
        # Guard the guard: a renamed test convention would make this script
        # print a clean run over nothing at all, which is the exact failure it
        # exists to stop.
        print("no test_* functions found in the ratchet module — check the import")
        return 2

    failures = 0
    for name in checks:
        function = getattr(module, name)
        args = [
            available[parameter]
            for parameter in function.__code__.co_varnames[
                : function.__code__.co_argcount
            ]
        ]
        try:
            function(*args)
        except AssertionError as exc:
            failures += 1
            print(f"FAIL  {name}\n{exc}\n")
        else:
            print(f"ok    {name}")

    print(
        f"\n{len(checks) - failures}/{len(checks)} checks passed "
        f"over {len(sizes)} source files, {len(baseline)} listed."
    )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
