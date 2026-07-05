"""Entity-scoped supplier suggestion for bank statement lines (BSF-3/4)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.banking.supplier_suggest import suggest_supplier_from_description
from app.db.session import entity_context, require_entity_context
from app.features.banking.classification_learning import suggest_classification
from app.features.banking.schema import ClassificationSuggestion
from app.features.banking.statement_models import StatementLineClassification
from app.features.suppliers.models import Supplier


def suggest_supplier_payment(
    session: Session,
    entity_id: uuid.UUID,
    description: str,
) -> ClassificationSuggestion | None:
    """Suggest supplier_payment when description matches a supplier name."""
    with entity_context(session, entity_id):
        require_entity_context()
        suppliers = list(
            session.scalars(select(Supplier).order_by(Supplier.name)).all()
        )
        if not suppliers:
            return None

        match = suggest_supplier_from_description(
            description,
            [(supplier.id, supplier.name) for supplier in suppliers],
        )
        if match is None:
            return None

        confidence = "high" if match.score >= 0.95 else "medium"
        return ClassificationSuggestion(
            classification=StatementLineClassification.SUPPLIER_PAYMENT,
            supplier_id=match.supplier_id,
            delivery_platform_id=None,
            reason=match.reason,
            confidence=confidence,
        )


def suggest_trusted_supplier_payment(
    session: Session,
    entity_id: uuid.UUID,
    description: str,
) -> ClassificationSuggestion | None:
    """Suggest supplier_payment when description matches a trusted auto-post supplier."""
    with entity_context(session, entity_id):
        require_entity_context()
        suppliers = list(
            session.scalars(
                select(Supplier)
                .where(
                    Supplier.is_active.is_(True),
                    Supplier.auto_post_payments.is_(True),
                )
                .order_by(Supplier.name)
            ).all()
        )
        if not suppliers:
            return None

        match = suggest_supplier_from_description(
            description,
            [(supplier.id, supplier.name) for supplier in suppliers],
        )
        if match is None:
            return None

        return ClassificationSuggestion(
            classification=StatementLineClassification.SUPPLIER_PAYMENT,
            supplier_id=match.supplier_id,
            delivery_platform_id=None,
            reason=f"Trusted supplier {match.supplier_name!r} — auto-post enabled",
            confidence="high",
        )


def suggest_line_classification(
    session: Session,
    entity_id: uuid.UUID,
    description: str,
    *,
    amount_kurus: int,
) -> ClassificationSuggestion | None:
    """Learned rule first; retail store heuristic; fuzzy supplier for other outflows."""
    learned = suggest_classification(session, description)
    if learned is not None:
        return learned
    if amount_kurus >= 0:
        return None

    from app.features.banking.store_purchase_service import suggest_store_purchase

    store = suggest_store_purchase(session, entity_id, description)
    if store is not None:
        return store
    return suggest_supplier_payment(session, entity_id, description)
