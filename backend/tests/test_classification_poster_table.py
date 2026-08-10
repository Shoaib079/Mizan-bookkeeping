"""Every classification either has a poster or is named as not needing one.

`classify_statement_line` used to be a flat chain of twenty-two
`if classification == …` blocks. A classification with no block fell out of
the bottom into the transfer branch, which then decided it was not a transfer
and raised something unrelated to what was actually wrong — the shape of
Class 12, a rule written per case and a case nobody wrote.

A table cannot silently fall through, but it can be silently incomplete. So
this compares it against the enum, which is the only place that knows every
classification the app admits to having.
"""

from __future__ import annotations

import pathlib
import re

from app.features.banking.statement_models import (
    BankStatementLine,
    StatementLineClassification,
)
from app.features.banking.statement_posters import CLASSIFICATION_POSTERS

#: Classifications that deliberately have no poster, and why.
#:
#: Kept as a mapping rather than a set so the reason travels with the name.
#: A bare exclusion list is how a genuinely missing poster hides — it looks
#: identical to a deliberate one.
NOT_POSTED = {
    "TRANSFER": (
        "not a posting at all — a transfer is a pairing of two statement "
        "lines, matched and linked after this dispatch"
    ),
    "UNCLASSIFIED": "the starting state of an imported line; nothing to post",
    "UNKNOWN": "a line the parser could not read; needs a person, not a rule",
}


def test_the_table_is_not_empty() -> None:
    """Guard the guard.

    Over an empty table every assertion below passes by comparing nothing,
    and the dispatch would be dead code that no test noticed.
    """
    assert len(CLASSIFICATION_POSTERS) >= 20


def test_every_classification_is_accounted_for() -> None:
    members = {member.name for member in StatementLineClassification}
    posted = {member.name for member in CLASSIFICATION_POSTERS}
    unaccounted = sorted(members - posted - set(NOT_POSTED))
    assert not unaccounted, (
        "These classifications have no poster and no stated reason. Add one to "
        "CLASSIFICATION_POSTERS, or to NOT_POSTED with the reason:\n  "
        + "\n  ".join(unaccounted)
    )


def test_the_exclusions_are_real_classifications() -> None:
    """A typo in NOT_POSTED would excuse a classification that does not exist,
    while the real one it was meant to name goes unposted and unnoticed."""
    members = {member.name for member in StatementLineClassification}
    invented = sorted(set(NOT_POSTED) - members)
    assert not invented, f"NOT_POSTED names things the enum does not have: {invented}"


def test_nothing_is_both_posted_and_excused() -> None:
    both = sorted({m.name for m in CLASSIFICATION_POSTERS} & set(NOT_POSTED))
    assert not both, (
        f"These have a poster and a reason for not having one: {both}. "
        "The reason is stale — remove it."
    )


def test_each_poster_is_distinct() -> None:
    """Two classifications sharing a poster would post one as the other.

    Cheap to check, and the kind of thing a copy-paste in the table produces:
    the entries are twenty-two nearly identical lines.
    """
    by_function: dict[object, list[str]] = {}
    for classification, poster in CLASSIFICATION_POSTERS.items():
        by_function.setdefault(poster, []).append(classification.name)
    shared = {fn.__name__: names for fn, names in by_function.items() if len(names) > 1}
    assert not shared, f"one poster serving several classifications: {shared}"


def test_each_poster_is_named_after_its_classification() -> None:
    """`_post_bank_fee` for BANK_FEE. Not cosmetic — the table is the only
    thing connecting the two, and a mismatch there is invisible at the call
    site and produces a posting of the wrong kind."""
    wrong = {
        member.name: poster.__name__
        for member, poster in CLASSIFICATION_POSTERS.items()
        if poster.__name__ != f"_post_{member.name.lower()}"
    }
    assert not wrong, f"table entries wired to the wrong poster: {wrong}"


def test_every_link_key_names_a_real_column() -> None:
    """`_finish_classified_line` does `setattr(line, key, value)`.

    A key that is not a column becomes an ordinary attribute on the instance:
    the commit succeeds and the counterparty is never recorded. A supplier
    payment with no supplier on the line, no error, nothing in the log.

    Extracting the posters rewrote twelve of these keys by mistake — the
    counterparty for supplier and customer payments, three staff kinds and all
    seven partner kinds. **One** of the twelve failed a test. This reads the
    keys out of the source so a typo fails here instead of in eleven places
    nobody is looking.
    """
    posters = pathlib.Path(__file__).resolve().parents[1] / "app" / "features" / "banking" / "statement_posters"
    source = "\n".join(f.read_text() for f in sorted(posters.glob("*.py")))
    keys = set(re.findall(r'^\s+"(\w+)": ', source, re.M))
    assert len(keys) >= 8, f"only found {len(keys)} link keys — the scan is broken"

    columns = set(BankStatementLine.__mapper__.columns.keys())
    strangers = sorted(keys - columns)
    assert not strangers, (
        "these link keys are not columns of bank_statement_lines, so the value "
        f"would be dropped silently: {strangers}"
    )
