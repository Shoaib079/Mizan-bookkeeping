"""A guessed VAT never reaches the ledger unattended, and never hides after.

When the e-Fatura reader finds no VAT breakdown it invents one: a single 20%
line covering the whole gap between net and gross. That is usually right. On a
telecom invoice it is not — part of the gap is ÖİV, which is not reclaimable,
and the assumption claims it as input KDV anyway. The number goes on a return.

Two rules, and they pull in opposite directions on purpose:

- **Auto-post must refuse it.** There is nobody looking, and the owner's rule
  is that a warning must never stop *them* recording — so the block belongs on
  the unattended path only. Posting by hand still works; the preview says the
  VAT was assumed and the decision is the owner's.
- **Confirming must not erase it.** Accepting an assumption does not turn it
  into a reading. The flag is the only way to find, later, which posted
  invoices carried a guessed KDV.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest

from app.features.invoices.models import (
    InvoiceDraft,
    InvoiceDraftStatus,
    InvoiceKind,
    InvoiceSourceType,
)
from app.features.invoices.one_click_post import (
    is_one_click_post_eligible,
    vat_was_assumed,
)

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")

NET = 100_000
GROSS = 120_000


class _Suggestion:
    """A high-confidence expense suggestion — the other gates already passed."""

    def __init__(self) -> None:
        self.account_id = uuid.uuid4()
        self.confidence = "high"


def _draft(*, raw: dict, linked: bool = True) -> InvoiceDraft:
    """A draft that clears every other one-click gate.

    Built unsaved for the eligibility tests: those rules are pure functions of
    the row, and giving them a database would only make it easier to write a
    test that passes for the wrong reason.

    `other_taxes_kurus=0` is set by hand because column defaults land at flush,
    not at construction — an unsaved row carries None where a real one carries
    0, and `validate_invoice_totals` adds it. The column is `nullable=False`
    with `server_default="0"`, so no persisted draft can reach that code with
    None; this is the test building something the database would refuse, not a
    gap in the validation.

    `linked` puts an invented supplier id on the row, because one-click
    eligibility refuses a draft with no supplier. Only safe while the row is
    never saved — the id has no supplier behind it and the foreign key would
    say so. The one test that saves passes `linked=False`.
    """
    return InvoiceDraft(
        status=InvoiceDraftStatus.NEEDS_REVIEW.value,
        invoice_kind=InvoiceKind.SUPPLIER.value,
        source_type=InvoiceSourceType.EFATURA_PDF,
        file_fingerprint=f"assumed-vat-{uuid.uuid4().hex}",
        supplier_id=uuid.uuid4() if linked else None,
        supplier_vkn="1234567890",
        invoice_number="TEL-1",
        invoice_date=date(2026, 1, 5),
        net_kurus=NET,
        gross_kurus=GROSS,
        other_taxes_kurus=0,
        vat_breakdown=[
            {"rate_percent": 20, "base_kurus": NET, "vat_kurus": GROSS - NET}
        ],
        currency="TRY",
        extraction_payload={"raw": raw},
    )


def _eligible(draft: InvoiceDraft) -> bool:
    return is_one_click_post_eligible(
        draft,
        classification_confidence="high",
        expense_suggestion=_Suggestion(),
    )


def test_a_clean_invoice_is_still_auto_postable():
    """The half that stops this being a test for a function returning False.

    Without it, deleting the whole feature would leave every assertion below
    passing.
    """
    assert _eligible(_draft(raw={})) is True


def test_an_assumed_vat_is_never_auto_posted():
    """The rule that matters: nobody is looking, so it does not go in."""
    assert _eligible(_draft(raw={"assumed_vat": True})) is False


def test_an_adjusted_net_is_never_auto_posted():
    """Same reasoning — the reader moved a figure to make the totals agree."""
    assert _eligible(_draft(raw={"net_adjusted": True})) is False


def test_the_block_does_not_depend_on_confidence_being_low():
    """The point of stating it directly.

    An assumed VAT sets `classification_confidence` to "low" at intake, and
    the confidence gate would refuse it on that basis alone. But that is one
    code path's side effect, not a rule — and the marker is cleared the moment
    anyone confirms. Every draft here is handed confidence "high" so the
    assertions above cannot be passing for that reason.
    """
    draft = _draft(raw={"assumed_vat": True})
    assert vat_was_assumed(draft) is True
    assert _eligible(draft) is False, (
        "with confidence forced to high, only the explicit gate can be refusing "
        "this — if it passes, the guard is the confidence gate and will vanish "
        "the day confidence is computed differently"
    )


def test_confirming_keeps_the_record_that_the_vat_was_a_guess(
    db_session, restaurant_a
):
    """Accepting an assumption does not make it a reading.

    Confirm used to strip `assumed_vat` along with the parse-quality markers,
    which left no way to answer "which posted invoices claimed a guessed KDV" —
    the exact question health check 0.6 is for, and the one worth asking before
    filing a return.
    """
    from app.db.session import entity_context
    from app.features.invoices.service import _recompute_confidence_on_confirm

    with entity_context(db_session, restaurant_a.id):
        # Saved for real, so no invented supplier: `_recompute_confidence_on_confirm`
        # reads `supplier_vkn`, not the link.
        draft = _draft(raw={"assumed_vat": True, "no_text_layer": True}, linked=False)
        db_session.add(draft)
        db_session.flush()

        _recompute_confidence_on_confirm(db_session, draft)

        raw = (draft.extraction_payload or {}).get("raw") or {}
        assert raw.get("assumed_vat") is True, (
            "the only evidence this KDV was inferred has been thrown away"
        )
        assert "no_text_layer" not in raw, (
            "parse-quality markers should still clear — the owner has now read "
            "the fields, so how well they parsed no longer matters"
        )
