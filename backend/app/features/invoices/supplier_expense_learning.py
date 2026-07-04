"""Supplier→expense-account learning — suggestions, confidence, corrections."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import DELIVERY_COMMISSION_EXPENSE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountType
from app.core.learning import LearningDomain, confidence_label, record_learning_correction
from app.db.base import utcnow
from app.features.invoices.supplier_expense_rule_models import SupplierExpenseAccountRule


@dataclass(frozen=True, slots=True)
class SupplierExpenseAccountSuggestion:
    account_id: uuid.UUID
    confidence: str
    learned: bool


def _validate_expense_account(
    session: Session,
    entity_id: uuid.UUID,
    account_id: uuid.UUID,
) -> Account | None:
    account = session.get(Account, account_id)
    if (
        account is None
        or account.entity_id != entity_id
        or not account.is_active
        or account.account_type != AccountType.EXPENSE
    ):
        return None
    return account


def suggest_commission_expense_account(
    session: Session,
) -> SupplierExpenseAccountSuggestion | None:
    """Commission invoices always use the seeded 5500 account."""
    account = session.scalar(
        select(Account).where(Account.code == DELIVERY_COMMISSION_EXPENSE_CODE)
    )
    if account is None or not account.is_active:
        return None
    return SupplierExpenseAccountSuggestion(
        account_id=account.id,
        confidence="high",
        learned=False,
    )


def suggest_supplier_expense_account(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
) -> SupplierExpenseAccountSuggestion | None:
    """Best learned expense account for this supplier, or None."""
    rule = session.scalar(
        select(SupplierExpenseAccountRule).where(
            SupplierExpenseAccountRule.supplier_id == supplier_id
        )
    )
    if rule is None:
        return None

    account = _validate_expense_account(session, entity_id, rule.expense_account_id)
    if account is None:
        return None

    label = confidence_label(rule.confirmation_count, rule.confirmations_since_correction)
    return SupplierExpenseAccountSuggestion(
        account_id=account.id,
        confidence=label,
        learned=True,
    )


def learn_supplier_expense_account(
    session: Session,
    entity_id: uuid.UUID,
    *,
    supplier_id: uuid.UUID,
    expense_account_id: uuid.UUID,
    suggested_account_id: uuid.UUID | None = None,
) -> None:
    """Persist owner-confirmed supplier→expense-account mapping."""
    if _validate_expense_account(session, entity_id, expense_account_id) is None:
        return

    if (
        suggested_account_id is not None
        and suggested_account_id != expense_account_id
    ):
        record_learning_correction(
            session,
            domain=LearningDomain.INVOICE,
            field_name="expense_account_id",
            before_value=str(suggested_account_id),
            after_value=str(expense_account_id),
            match_token=str(supplier_id),
        )

    now = utcnow()
    existing = session.scalar(
        select(SupplierExpenseAccountRule).where(
            SupplierExpenseAccountRule.supplier_id == supplier_id
        )
    )
    if existing is not None:
        mapping_changed = existing.expense_account_id != expense_account_id
        existing.expense_account_id = expense_account_id
        if mapping_changed:
            existing.correction_count += 1
            existing.confirmation_count = 1
            existing.confirmations_since_correction = 1
        else:
            existing.confirmation_count += 1
            existing.confirmations_since_correction += 1
        existing.last_used_at = now
        existing.updated_at = now
        session.flush()
        return

    session.add(
        SupplierExpenseAccountRule(
            supplier_id=supplier_id,
            expense_account_id=expense_account_id,
            confirmation_count=1,
            confirmations_since_correction=1,
            correction_count=0,
            last_used_at=now,
        )
    )
    session.flush()
