"""The capability table accounts for every journal source, and says so.

Phase 2, step 1. `CAPABILITIES` is built beside the resolver and nothing calls
it yet. These tests pin it to the code it will replace, so the switchover in
step 2 is a change of caller rather than a change of behaviour.

The risk in this refactor is not a crash. It is a source quietly getting the
wrong void path — every path here belongs to a real route, so a wrong one does
not 404, it voids the wrong record. Two of my three readings of the resolver
were wrong before these tests existed:

  - taking "the last answer in a branch" as the branch's answer, which would
    have sent every customer credit sale to a group-sale URL
  - reading `VOID_AND_REENTER_SOURCES` as "void via the generic path", when
    only RULE_AUTO and SYSTEM get a path and the rest get no buttons at all

Neither would have thrown. Both would have shipped.
"""

from __future__ import annotations

import re

import pytest

from app.core.ledger.correction import (
    DEDICATED_CORRECTION_ROUTES,
    GENERIC_CORRECTABLE_SOURCES,
    VOID_AND_REENTER_SOURCES,
)
from app.core.ledger.entry_actions import _is_generic_void_safe
from app.core.ledger.entry_capabilities import (
    _ESCAPES_WITH_REASONS,
    CAPABILITIES,
    Capability,
)
from app.core.ledger.models import JournalEntrySource


def _answered_by_a_generic_rule(source: JournalEntrySource) -> bool:
    return source in GENERIC_CORRECTABLE_SOURCES or _is_generic_void_safe(source)


# --- completeness ---------------------------------------------------------


def test_the_table_is_not_empty():
    """Guard the guard — every assertion below is vacuous over an empty table."""
    assert len(CAPABILITIES) > 20


def test_every_source_is_accounted_for():
    """A new journal source fails here rather than silently offering nothing.

    `correction.py` already refuses to start if a source is unclassified for
    correction. This is the same promise for the *actions* side, which is the
    half the user actually sees: a source nobody classified draws no Edit and
    no Void, and looks exactly like a source that is not meant to have any.
    """
    unaccounted = sorted(
        source.value
        for source in JournalEntrySource
        if source not in CAPABILITIES
        and source not in _ESCAPES_WITH_REASONS
        and not _answered_by_a_generic_rule(source)
    )
    assert unaccounted == [], (
        "these journal sources have no answer for can-edit / can-void:\n  "
        + "\n  ".join(unaccounted)
        + "\n\nAdd a row to CAPABILITIES, or an entry to _ESCAPES_WITH_REASONS "
        "with the reason a table row cannot express it."
    )


def test_nothing_is_both_in_the_table_and_escaped():
    """Two answers for one source is the very thing being removed."""
    both = set(CAPABILITIES) & set(_ESCAPES_WITH_REASONS)
    assert both == set(), f"answered twice: {[s.value for s in both]}"


def test_every_escape_carries_a_reason_worth_reading():
    """An exception list is only safe while it is embarrassing to add to."""
    for source, reason in _ESCAPES_WITH_REASONS.items():
        assert len(reason) > 40, (
            f"{source.value} escapes the table with a reason too short to "
            "explain itself — say what the row decides that the source cannot"
        )


def test_the_escapes_are_few():
    """If this starts failing, the table is the wrong shape and should change,
    not grow a longer list of exceptions."""
    assert len(_ESCAPES_WITH_REASONS) <= 4


# --- the table agrees with the registries it must not restate -------------


@pytest.mark.parametrize(
    "source,cap", sorted(CAPABILITIES.items(), key=lambda kv: kv[0].value)
)
def test_editable_only_where_a_correction_route_exists(
    source: JournalEntrySource, cap: Capability
):
    """`can_edit` must not promise what `correction.py` cannot deliver.

    This is the exact disagreement behind "no edit on delivery commission":
    the registry said void-only, the resolver had no branch, and between them
    the answer was neither. One table cannot disagree with itself, but it can
    still disagree with the correction registry — so that is checked here.
    """
    if not cap.can_edit:
        return
    assert (
        source in DEDICATED_CORRECTION_ROUTES
        or source in GENERIC_CORRECTABLE_SOURCES
    ), (
        f"{source.value} offers Edit, but correction.py has no route for it — "
        "the button would open a form that cannot be submitted"
    )


@pytest.mark.parametrize(
    "source,cap", sorted(CAPABILITIES.items(), key=lambda kv: kv[0].value)
)
def test_void_and_reenter_sources_are_never_editable(
    source: JournalEntrySource, cap: Capability
):
    if source in VOID_AND_REENTER_SOURCES:
        assert not cap.can_edit, (
            f"{source.value} is registered void-and-re-enter, so offering Edit "
            "contradicts the registry"
        )


# --- the parts that produce a URL ----------------------------------------


@pytest.mark.parametrize(
    "source,cap", sorted(CAPABILITIES.items(), key=lambda kv: kv[0].value)
)
def test_a_void_path_uses_only_placeholders_it_can_fill(
    source: JournalEntrySource, cap: Capability
):
    """`{owner_id}` needs an owner to read it from.

    A template naming a placeholder nothing fills would format into the string
    "{owner_id}" and produce a URL that looks plausible and matches no route.
    """
    if cap.void_path is None:
        assert not cap.can_void, f"{source.value} can be voided but has no path"
        return
    placeholders = set(re.findall(r"\{(\w+)\}", cap.void_path))
    assert placeholders <= {"owner_id", "entry_id"}, (
        f"{source.value} uses unknown placeholders: "
        f"{placeholders - {'owner_id', 'entry_id'}}"
    )
    if "owner_id" in placeholders:
        assert cap.owner is not None, (
            f"{source.value} builds its path from an owner id but declares no "
            "owner to look up"
        )


@pytest.mark.parametrize(
    "source,cap", sorted(CAPABILITIES.items(), key=lambda kv: kv[0].value)
)
def test_the_owner_column_exists_on_the_owner_model(
    source: JournalEntrySource, cap: Capability
):
    """A typo here fails on the day someone voids that kind, not today."""
    if cap.owner is None:
        return
    assert hasattr(cap.owner.model, cap.owner.id_field), (
        f"{source.value} reads {cap.owner.id_field!r} off "
        f"{cap.owner.model.__name__}, which has no such column"
    )
    assert hasattr(cap.owner.model, "journal_entry_id"), (
        f"{cap.owner.model.__name__} is looked up by journal_entry_id and has none"
    )


@pytest.mark.parametrize(
    "source,cap", sorted(CAPABILITIES.items(), key=lambda kv: kv[0].value)
)
def test_an_edit_kind_comes_with_a_context_and_the_reverse(
    source: JournalEntrySource, cap: Capability
):
    """A form with no fields, or fields with no form, are both dead ends."""
    assert (cap.edit_kind is None) == (cap.context is None), (
        f"{source.value} declares edit_kind={cap.edit_kind!r} and "
        f"context={'set' if cap.context else 'None'} — they go together"
    )
    assert cap.can_edit == (cap.edit_kind is not None), (
        f"{source.value} says can_edit={cap.can_edit} but "
        f"{'has' if cap.edit_kind else 'has no'} edit kind"
    )


# The check that every edit kind is one the resolver produces was removed when
# the resolver became this table: it compared the table against the code that
# now reads it, which is a thing comparing itself. The question it was really
# asking — does the frontend have a case for every kind — is answered by
# `gl-edit-kinds.test.ts`, which now reads this file.
