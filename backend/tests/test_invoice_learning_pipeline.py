"""Invoice learning pipeline — RC fixes + commission one-click post."""

from __future__ import annotations

import hashlib
import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.learning import HIGH_CONFIDENCE_THRESHOLD
from app.db.session import entity_context
from app.features.invoices.classification_learning import learn_invoice_classification_rule
from app.features.invoices.classification_rule_models import InvoiceClassificationRule
from app.features.invoices.models import InvoiceDraftStatus, InvoiceKind, InvoiceSourceType
from app.features.invoices.one_click_post import is_one_click_post_eligible
from app.features.invoices.payload_helpers import pdf_text_from_payload as _pdf_text_from_payload
from app.features.invoices.supplier_expense_learning import suggest_commission_expense_account
from app.features.invoices import service as invoice_service
from app.adapters.ocr_ai.efatura import EInvoiceExtraction

from tests.delivery_helpers import ACTOR_ID, delivery_setup as build_delivery_setup

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura" / "regression"
GETIR_SUPPLY = FIXTURES / "getir_supply.pdf"
COMMISSION_58 = FIXTURES / "58.pdf"


@pytest.fixture
def delivery_entity(db_session, restaurant_a):
    return build_delivery_setup(db_session, restaurant_a.id)


# ---------------------------------------------------------------------------
# RC2: _pdf_text_from_payload reads nested raw.text_sample
# ---------------------------------------------------------------------------

def test_pdf_text_from_payload_reads_nested() -> None:
    payload = {"raw": {"text_sample": "komisyon hizmet bedeli fatura"}}
    assert _pdf_text_from_payload(payload) == "komisyon hizmet bedeli fatura"


def test_pdf_text_from_payload_reads_toplevel_fallback() -> None:
    payload = {"text_sample": "some text"}
    assert _pdf_text_from_payload(payload) == "some text"


def test_pdf_text_from_payload_returns_none_for_empty() -> None:
    assert _pdf_text_from_payload({}) is None
    assert _pdf_text_from_payload({"raw": {}}) is None
    assert _pdf_text_from_payload({"raw": {"text_sample": "  "}}) is None


# ---------------------------------------------------------------------------
# RC4: Rules keyed by (entity_id, seller_vkn, match_token) — no collision
# ---------------------------------------------------------------------------

def test_getir_mixed_vkn_builds_independent_rules(
    db_session, delivery_entity
) -> None:
    """Getir grocery confirm + Getir commission confirm → 2 independent rules,
    not a counter-resetting collision."""
    entity_id = delivery_entity["entity_id"]
    platform_id = delivery_entity["platforms"]["Getir"].id

    grocery_extraction = EInvoiceExtraction(
        supplier_name="GETİR BİLGİ TEKNOLOJİLERİ",
        supplier_vkn="1112223334",
        invoice_number="GS001",
        invoice_date=None,
        net_kurus=10000,
        gross_kurus=11800,
        vat_breakdown=[{"rate_percent": 18, "base_kurus": 10000, "vat_kurus": 1800}],
        currency="TRY",
    )
    commission_extraction = EInvoiceExtraction(
        supplier_name="GETİR BİLGİ TEKNOLOJİLERİ",
        supplier_vkn="5556667778",
        invoice_number="GC001",
        invoice_date=None,
        net_kurus=5000,
        gross_kurus=5900,
        vat_breakdown=[{"rate_percent": 18, "base_kurus": 5000, "vat_kurus": 900}],
        currency="TRY",
    )
    pdf_text = "komisyon hizmet bedeli"

    with entity_context(db_session, entity_id):
        learn_invoice_classification_rule(
            db_session,
            extraction=grocery_extraction,
            invoice_kind=InvoiceKind.SUPPLIER.value,
            pdf_text=pdf_text,
        )
        learn_invoice_classification_rule(
            db_session,
            extraction=commission_extraction,
            invoice_kind=InvoiceKind.DELIVERY_COMMISSION.value,
            delivery_platform_id=platform_id,
            pdf_text=pdf_text,
        )
        db_session.commit()

        rules = list(db_session.scalars(select(InvoiceClassificationRule)))
        assert len(rules) == 2

        supplier_rules = [r for r in rules if r.seller_vkn == "1112223334"]
        commission_rules = [r for r in rules if r.seller_vkn == "5556667778"]
        assert len(supplier_rules) == 1
        assert len(commission_rules) == 1
        assert supplier_rules[0].invoice_kind == InvoiceKind.SUPPLIER.value
        assert commission_rules[0].invoice_kind == InvoiceKind.DELIVERY_COMMISSION.value
        assert supplier_rules[0].confirmation_count == 1
        assert commission_rules[0].confirmation_count == 1


def test_ys_trendyol_commission_rules_independent(
    db_session, delivery_entity
) -> None:
    """YS + Trendyol commission rules with same token but different VKNs stay independent."""
    entity_id = delivery_entity["entity_id"]
    ys_platform = delivery_entity["platforms"]["Yemeksepeti"].id
    ty_platform = delivery_entity["platforms"]["Trendyol"].id
    pdf_text = "komisyon hizmet bedeli"

    ys_extraction = EInvoiceExtraction(
        supplier_name="YEMEKSEPETI",
        supplier_vkn="9990001111",
        invoice_number="YS001",
        invoice_date=None,
        net_kurus=8000,
        gross_kurus=9440,
        vat_breakdown=[{"rate_percent": 18, "base_kurus": 8000, "vat_kurus": 1440}],
        currency="TRY",
    )
    ty_extraction = EInvoiceExtraction(
        supplier_name="TRENDYOL",
        supplier_vkn="8880002222",
        invoice_number="TY001",
        invoice_date=None,
        net_kurus=6000,
        gross_kurus=7080,
        vat_breakdown=[{"rate_percent": 18, "base_kurus": 6000, "vat_kurus": 1080}],
        currency="TRY",
    )

    with entity_context(db_session, entity_id):
        for _ in range(HIGH_CONFIDENCE_THRESHOLD):
            learn_invoice_classification_rule(
                db_session,
                extraction=ys_extraction,
                invoice_kind=InvoiceKind.DELIVERY_COMMISSION.value,
                delivery_platform_id=ys_platform,
                pdf_text=pdf_text,
            )
        for _ in range(HIGH_CONFIDENCE_THRESHOLD):
            learn_invoice_classification_rule(
                db_session,
                extraction=ty_extraction,
                invoice_kind=InvoiceKind.DELIVERY_COMMISSION.value,
                delivery_platform_id=ty_platform,
                pdf_text=pdf_text,
            )
        db_session.commit()

        rules = list(db_session.scalars(select(InvoiceClassificationRule)))
        ys_rules = [r for r in rules if r.seller_vkn == "9990001111"]
        ty_rules = [r for r in rules if r.seller_vkn == "8880002222"]
        assert len(ys_rules) == 1
        assert len(ty_rules) == 1
        assert ys_rules[0].delivery_platform_id == ys_platform
        assert ty_rules[0].delivery_platform_id == ty_platform
        assert ys_rules[0].confirmation_count == HIGH_CONFIDENCE_THRESHOLD
        assert ty_rules[0].confirmation_count == HIGH_CONFIDENCE_THRESHOLD


# ---------------------------------------------------------------------------
# RC1: Partial-parse supplier → owner confirms 3x → one-click eligible
# ---------------------------------------------------------------------------

def test_partial_parse_supplier_becomes_oneclick_after_confirms(
    db_session, delivery_entity
) -> None:
    """When an owner confirms a partial-parse draft 3x, the classification_confidence
    should upgrade from the learned rule — enabling one-click post."""
    entity_id = delivery_entity["entity_id"]

    from app.features.invoices.models import InvoiceDraft
    from app.features.suppliers.service import create_supplier
    from app.features.suppliers.schema import SupplierCreate

    with entity_context(db_session, entity_id):
        supplier = create_supplier(
            db_session, entity_id,
            SupplierCreate(name="METRO GROSSMARKET", vkn="6200031354"),
        )
        db_session.commit()

    for i in range(HIGH_CONFIDENCE_THRESHOLD):
        draft_id = uuid.uuid4()
        with entity_context(db_session, entity_id):
            draft = InvoiceDraft(
                id=draft_id,
                entity_id=entity_id,
                invoice_kind=InvoiceKind.SUPPLIER.value,
                source_type=InvoiceSourceType.EFATURA_PDF.value,
                file_fingerprint=hashlib.sha256(draft_id.bytes).hexdigest(),
                status=InvoiceDraftStatus.DRAFT.value,
                supplier_name="METRO GROSSMARKET",
                supplier_vkn="6200031354",
                supplier_id=supplier.id,
                invoice_number=f"MTR{i:03d}",
                invoice_date=date.today(),
                net_kurus=50000,
                gross_kurus=59000,
                vat_breakdown=[{"rate_percent": 18, "base_kurus": 50000, "vat_kurus": 9000}],
                currency="TRY",
                other_taxes_kurus=0,
                extraction_payload={
                    "raw": {
                        "assumed_vat": True,
                        "text_sample": "metro gross market istanbul",
                    },
                },
            )
            db_session.add(draft)
            db_session.commit()

        invoice_service.confirm_invoice_draft(
            db_session,
            entity_id,
            draft_id,
            actor_id=ACTOR_ID,
        )

    with entity_context(db_session, entity_id):
        rules = list(db_session.scalars(select(InvoiceClassificationRule)))
        metro_rules = [r for r in rules if r.seller_vkn == "6200031354"]
        assert len(metro_rules) >= 1
        best = max(metro_rules, key=lambda r: r.confirmation_count)
        assert best.confirmation_count >= HIGH_CONFIDENCE_THRESHOLD


# ---------------------------------------------------------------------------
# RC3: Medium-confidence learned platform arrives pre-filled
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not COMMISSION_58.exists(),
    reason="fixture 58.pdf not available",
)
def test_medium_confidence_learned_platform_prefilled(
    db_session, delivery_entity
) -> None:
    """At medium confidence, the learned platform_id must still be pre-filled."""
    entity_id = delivery_entity["entity_id"]
    platform_id = delivery_entity["platforms"]["Getir"].id
    pdf_bytes = COMMISSION_58.read_bytes()

    draft = invoice_service.create_efatura_draft_from_upload(
        db_session,
        entity_id,
        pdf_bytes,
        filename="58_medium.pdf",
    )
    if draft.invoice_kind == InvoiceKind.DELIVERY_COMMISSION:
        invoice_service.link_delivery_platform_to_draft(
            db_session,
            entity_id,
            draft.id,
            delivery_platform_id=platform_id,
        )
    invoice_service.confirm_invoice_draft(
        db_session, entity_id, draft.id, actor_id=ACTOR_ID,
    )

    suffix = uuid.uuid4().hex[:8].encode()
    second_bytes = pdf_bytes + b"\n%" + suffix
    second = invoice_service.create_efatura_draft_from_upload(
        db_session,
        entity_id,
        second_bytes,
        filename="58_medium_2.pdf",
    )
    if second.invoice_kind == InvoiceKind.DELIVERY_COMMISSION:
        payload = {}
        with entity_context(db_session, entity_id):
            from app.features.invoices.models import InvoiceDraft
            row = db_session.get(InvoiceDraft, second.id)
            payload = row.extraction_payload or {}
        confidence = payload.get("classification_confidence")
        if confidence in ("medium", "low"):
            assert second.delivery_platform_id == platform_id, (
                "Learned platform should be pre-filled even at medium confidence"
            )


# ---------------------------------------------------------------------------
# PART2: Commission one-click post — eligible only with learned HIGH + platform
# ---------------------------------------------------------------------------

def test_commission_oneclick_ineligible_without_learned_high(
    db_session, delivery_entity
) -> None:
    """Commission draft is NOT one-click eligible without HIGH learned classification."""
    entity_id = delivery_entity["entity_id"]

    from app.features.invoices.models import InvoiceDraft

    with entity_context(db_session, entity_id):
        _id1 = uuid.uuid4()
        draft = InvoiceDraft(
            id=_id1,
            entity_id=entity_id,
            invoice_kind=InvoiceKind.DELIVERY_COMMISSION.value,
            source_type=InvoiceSourceType.EFATURA_PDF.value,
            file_fingerprint=hashlib.sha256(_id1.bytes).hexdigest(),
            status=InvoiceDraftStatus.DRAFT.value,
            supplier_name="GETIR",
            supplier_vkn="1112223334",
            invoice_number="COMM001",
            invoice_date=date.today(),
            net_kurus=5000,
            gross_kurus=5900,
            vat_breakdown=[{"rate_percent": 18, "base_kurus": 5000, "vat_kurus": 900}],
            currency="TRY",
            delivery_platform_id=delivery_entity["platforms"]["Getir"].id,
            other_taxes_kurus=0,
            extraction_payload={"classification_learned": True},
        )
        db_session.add(draft)
        db_session.flush()

        expense = suggest_commission_expense_account(db_session)
        assert expense is not None

        assert not is_one_click_post_eligible(
            draft,
            classification_confidence="medium",
            expense_suggestion=expense,
            classification_learned=True,
        ), "Medium confidence should not be one-click eligible for commission"

        assert not is_one_click_post_eligible(
            draft,
            classification_confidence="high",
            expense_suggestion=expense,
            classification_learned=False,
        ), "Heuristic-high (not learned) should not be one-click eligible for commission"


def test_commission_oneclick_eligible_with_learned_high(
    db_session, delivery_entity
) -> None:
    """Commission draft IS one-click eligible with learned HIGH + platform linked."""
    entity_id = delivery_entity["entity_id"]

    from app.features.invoices.models import InvoiceDraft

    with entity_context(db_session, entity_id):
        _id2 = uuid.uuid4()
        draft = InvoiceDraft(
            id=_id2,
            entity_id=entity_id,
            invoice_kind=InvoiceKind.DELIVERY_COMMISSION.value,
            source_type=InvoiceSourceType.EFATURA_PDF.value,
            file_fingerprint=hashlib.sha256(_id2.bytes).hexdigest(),
            status=InvoiceDraftStatus.DRAFT.value,
            supplier_name="GETIR",
            supplier_vkn="1112223334",
            invoice_number="COMM002",
            invoice_date=date.today(),
            net_kurus=5000,
            gross_kurus=5900,
            vat_breakdown=[{"rate_percent": 18, "base_kurus": 5000, "vat_kurus": 900}],
            currency="TRY",
            delivery_platform_id=delivery_entity["platforms"]["Getir"].id,
            other_taxes_kurus=0,
            extraction_payload={"classification_learned": True},
        )
        db_session.add(draft)
        db_session.flush()

        expense = suggest_commission_expense_account(db_session)
        assert expense is not None

        assert is_one_click_post_eligible(
            draft,
            classification_confidence="high",
            expense_suggestion=expense,
            classification_learned=True,
        ), "Learned HIGH + platform linked should be eligible"


def test_commission_oneclick_ineligible_without_platform(
    db_session, delivery_entity
) -> None:
    """Commission draft without platform linked is NOT one-click eligible."""
    entity_id = delivery_entity["entity_id"]

    from app.features.invoices.models import InvoiceDraft

    with entity_context(db_session, entity_id):
        _id3 = uuid.uuid4()
        draft = InvoiceDraft(
            id=_id3,
            entity_id=entity_id,
            invoice_kind=InvoiceKind.DELIVERY_COMMISSION.value,
            source_type=InvoiceSourceType.EFATURA_PDF.value,
            file_fingerprint=hashlib.sha256(_id3.bytes).hexdigest(),
            status=InvoiceDraftStatus.DRAFT.value,
            supplier_name="GETIR",
            supplier_vkn="1112223334",
            invoice_number="COMM003",
            invoice_date=date.today(),
            net_kurus=5000,
            gross_kurus=5900,
            vat_breakdown=[{"rate_percent": 18, "base_kurus": 5000, "vat_kurus": 900}],
            currency="TRY",
            delivery_platform_id=None,
            other_taxes_kurus=0,
            extraction_payload={"classification_learned": True},
        )
        db_session.add(draft)
        db_session.flush()

        expense = suggest_commission_expense_account(db_session)
        assert expense is not None

        assert not is_one_click_post_eligible(
            draft,
            classification_confidence="high",
            expense_suggestion=expense,
            classification_learned=True,
        ), "No platform → not eligible"


def test_supplier_oneclick_still_works(
    db_session, delivery_entity
) -> None:
    """Existing supplier one-click path remains functional."""
    entity_id = delivery_entity["entity_id"]

    from app.features.invoices.models import InvoiceDraft
    from app.features.invoices.supplier_expense_learning import SupplierExpenseAccountSuggestion
    from app.features.suppliers.service import create_supplier
    from app.features.suppliers.schema import SupplierCreate

    with entity_context(db_session, entity_id):
        supplier = create_supplier(
            db_session, entity_id,
            SupplierCreate(name="METRO", vkn="6200031354"),
        )

        from app.core.chart_of_accounts.models import Account
        from app.core.chart_of_accounts.types import AccountType
        expense_acct = db_session.scalar(
            select(Account).where(
                Account.entity_id == entity_id,
                Account.account_type == AccountType.EXPENSE,
                Account.is_active.is_(True),
            )
        )
        assert expense_acct is not None

        _id4 = uuid.uuid4()
        draft = InvoiceDraft(
            id=_id4,
            entity_id=entity_id,
            invoice_kind=InvoiceKind.SUPPLIER.value,
            source_type=InvoiceSourceType.EFATURA_PDF.value,
            file_fingerprint=hashlib.sha256(_id4.bytes).hexdigest(),
            status=InvoiceDraftStatus.DRAFT.value,
            supplier_name="METRO",
            supplier_vkn="6200031354",
            supplier_id=supplier.id,
            invoice_number="SUP001",
            invoice_date=date.today(),
            net_kurus=50000,
            gross_kurus=59000,
            vat_breakdown=[{"rate_percent": 18, "base_kurus": 50000, "vat_kurus": 9000}],
            currency="TRY",
            other_taxes_kurus=0,
        )
        db_session.add(draft)
        db_session.flush()

        expense_suggestion = SupplierExpenseAccountSuggestion(
            account_id=expense_acct.id,
            confidence="high",
            learned=True,
        )
        assert is_one_click_post_eligible(
            draft,
            classification_confidence="high",
            expense_suggestion=expense_suggestion,
        ), "Supplier one-click should still work"
