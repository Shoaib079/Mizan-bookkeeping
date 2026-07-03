"""Unified document learning — invoice IC-D + correction audit."""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

from app.adapters.ocr_ai.efatura import extract_efatura_pdf
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.learning.correction_events import LearningCorrectionEvent
from app.core.learning.types import LearningDomain
from app.db.session import entity_context
from app.features.invoices.classification_learning import (
    classify_invoice_intake,
    learn_invoice_classification_rule,
    suggest_invoice_classification,
)
from app.features.invoices.classification_rule_models import InvoiceClassificationRule
from app.features.invoices.models import InvoiceDraftStatus, InvoiceKind
from app.features.invoices import service as invoice_service
from tests.delivery_helpers import ACTOR_ID, delivery_setup as build_delivery_setup

from tests.fixtures.efatura.regression_constants import REGRESSION_FIXTURE_BUYER_VKN

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura" / "regression"
GETIR_SUPPLY = FIXTURES / "getir_supply.pdf"


@pytest.fixture
def delivery_entity(db_session, restaurant_a):
    return build_delivery_setup(db_session, restaurant_a.id)


def test_invoice_learn_on_confirm_then_suggest_getir_supply(
    db_session, delivery_entity
) -> None:
    entity_id = delivery_entity["entity_id"]
    pdf_bytes = GETIR_SUPPLY.read_bytes()
    extraction = extract_efatura_pdf(pdf_bytes, buyer_vkn=REGRESSION_FIXTURE_BUYER_VKN)
    text = extraction.raw.get("text_sample") if extraction.raw else None

    with entity_context(db_session, entity_id):
        learn_invoice_classification_rule(
            db_session,
            extraction=extraction,
            invoice_kind=InvoiceKind.SUPPLIER.value,
            pdf_text=text,
            match_token="depo",
        )
        db_session.commit()

        suggestion = suggest_invoice_classification(
            db_session, extraction, pdf_text=text
        )
        assert suggestion is not None
        assert suggestion.invoice_kind == InvoiceKind.SUPPLIER.value
        assert suggestion.learned is True

        kind, platform, confidence, review = classify_invoice_intake(
            db_session, extraction, pdf_text=text
        )
        assert kind == InvoiceKind.SUPPLIER.value
        assert platform is None
        assert confidence in ("low", "medium")
        assert review is not None


def test_invoice_correction_relearns_after_set_kind(
    db_session, delivery_entity
) -> None:
    entity_id = delivery_entity["entity_id"]
    platform_id = delivery_entity["platforms"]["Getir"].id
    pdf_bytes = GETIR_SUPPLY.read_bytes()

    draft_out = invoice_service.create_efatura_draft_from_upload(
        db_session,
        entity_id,
        pdf_bytes,
        filename="getir_supply.pdf",
    )
    assert draft_out.invoice_kind == InvoiceKind.SUPPLIER

    commission_pdf = (FIXTURES / "58.pdf").read_bytes()
    wrong = invoice_service.create_efatura_draft_from_upload(
        db_session,
        entity_id,
        commission_pdf,
        filename="58.pdf",
    )
    assert wrong.invoice_kind == InvoiceKind.DELIVERY_COMMISSION

    corrected = invoice_service.set_invoice_draft_kind(
        db_session,
        entity_id,
        wrong.id,
        invoice_kind=InvoiceKind.SUPPLIER,
    )
    assert corrected.invoice_kind == InvoiceKind.SUPPLIER

    with entity_context(db_session, entity_id):
        events = list(
            db_session.scalars(
                select(LearningCorrectionEvent).where(
                    LearningCorrectionEvent.domain == LearningDomain.INVOICE.value,
                    LearningCorrectionEvent.field_name == "invoice_kind",
                )
            )
        )
        assert len(events) >= 1
        assert events[-1].before_value == InvoiceKind.DELIVERY_COMMISSION.value
        assert events[-1].after_value == InvoiceKind.SUPPLIER.value

        rules = list(db_session.scalars(select(InvoiceClassificationRule)))
        assert any(
            rule.invoice_kind == InvoiceKind.SUPPLIER.value for rule in rules
        )


def test_invoice_learn_on_confirm_increments_rule(
    db_session, delivery_entity
) -> None:
    entity_id = delivery_entity["entity_id"]
    platform_id = delivery_entity["platforms"]["Getir"].id
    pdf_bytes = (FIXTURES / "58.pdf").read_bytes()

    draft = invoice_service.create_efatura_draft_from_upload(
        db_session,
        entity_id,
        pdf_bytes,
        filename="58.pdf",
    )
    invoice_service.link_delivery_platform_to_draft(
        db_session,
        entity_id,
        draft.id,
        delivery_platform_id=platform_id,
    )
    invoice_service.confirm_invoice_draft(
        db_session,
        entity_id,
        draft.id,
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, entity_id):
        rules = list(db_session.scalars(select(InvoiceClassificationRule)))
        assert len(rules) >= 1
        assert any(
            rule.invoice_kind == InvoiceKind.DELIVERY_COMMISSION.value
            and rule.delivery_platform_id == platform_id
            for rule in rules
        )


def test_entity_a_invoice_rules_invisible_in_entity_b(
    db_session, restaurant_a, restaurant_b
) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    seed_default_chart(db_session, restaurant_b.id)
    pdf_bytes = GETIR_SUPPLY.read_bytes()
    extraction = extract_efatura_pdf(pdf_bytes, buyer_vkn=REGRESSION_FIXTURE_BUYER_VKN)
    text = extraction.raw.get("text_sample") if extraction.raw else None

    with entity_context(db_session, restaurant_a.id):
        learn_invoice_classification_rule(
            db_session,
            extraction=extraction,
            invoice_kind=InvoiceKind.SUPPLIER.value,
            pdf_text=text,
            match_token="depo",
        )
        db_session.commit()

    with entity_context(db_session, restaurant_b.id):
        assert (
            suggest_invoice_classification(
                db_session, extraction, pdf_text=text
            )
            is None
        )
