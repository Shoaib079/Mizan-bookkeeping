"""Store purchase suggestions for bank statement lines (P8)."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.banking.store_purchase_detect import is_store_purchase_description
from app.core.chart_of_accounts.default_chart import SUPPLIES_EXPENSE_CODE
from app.core.chart_of_accounts.seed import get_account_by_code
from app.db.session import entity_context, require_entity_context
from app.features.banking.schema import ClassificationSuggestion
from app.features.banking.statement_models import StatementLineClassification


def default_supplies_expense_account_id(
    session: Session, entity_id: uuid.UUID
) -> uuid.UUID | None:
    with entity_context(session, entity_id):
        require_entity_context()
        account = get_account_by_code(session, entity_id, SUPPLIES_EXPENSE_CODE)
        return account.id if account is not None else None


def suggest_store_purchase(
    session: Session,
    entity_id: uuid.UUID,
    description: str,
) -> ClassificationSuggestion | None:
    """Suggest store_purchase for known retail chains — expense-only, not supplier AP."""
    match = is_store_purchase_description(description)
    if match is None:
        return None

    expense_account_id = default_supplies_expense_account_id(session, entity_id)
    if expense_account_id is None:
        return None

    return ClassificationSuggestion(
        classification=StatementLineClassification.STORE_PURCHASE,
        supplier_id=None,
        delivery_platform_id=None,
        expense_account_id=expense_account_id,
        reason=f"Retail store {match.store_name!r} — grocery/card purchase (no invoice)",
        confidence="medium",
    )
