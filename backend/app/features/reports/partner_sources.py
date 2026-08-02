"""Partner-facing journal sources — hide internal RULE_AUTO tagging.

Auto-posted bank lines keep ``JournalEntrySource.RULE_AUTO`` in the ledger for
audit, but partner Excel/PDF and cash-flow breakdowns should show the economic
type (Bank fee, Supplier payment, …) so rows land with their real peers.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntrySource
from app.features.banking.statement_models import (
    BankStatementLine,
    StatementLineClassification,
)
from app.features.invoices.models import InvoiceDraft

__all__ = [
    "economic_source_value",
    "load_rule_auto_economic_sources",
]

_CLASSIFICATION_TO_SOURCE: dict[StatementLineClassification, JournalEntrySource] = {
    StatementLineClassification.BANK_FEE: JournalEntrySource.BANK_FEE,
    StatementLineClassification.SUPPLIER_PAYMENT: JournalEntrySource.PAYMENT,
    StatementLineClassification.STORE_PURCHASE: JournalEntrySource.EXPENSE_ENTRY,
    StatementLineClassification.RENT_UTILITY: JournalEntrySource.EXPENSE_ENTRY,
    StatementLineClassification.OTHER_INCOME: JournalEntrySource.SYSTEM,
    StatementLineClassification.POS_COMMISSION: JournalEntrySource.POS_COMMISSION_STATEMENT,
    StatementLineClassification.CREDIT_CARD_PAYMENT: JournalEntrySource.CREDIT_CARD_PAYMENT,
    StatementLineClassification.CUSTOMER_PAYMENT: JournalEntrySource.CUSTOMER_PAYMENT_RECEIVED,
    StatementLineClassification.STAFF_PAYMENT: JournalEntrySource.STAFF_PAYMENT,
    StatementLineClassification.STAFF_ADVANCE: JournalEntrySource.STAFF_ADVANCE,
    StatementLineClassification.STAFF_INCENTIVE: JournalEntrySource.STAFF_PAYMENT,
    StatementLineClassification.PARTNER_DRAWING: JournalEntrySource.PARTNER_DRAWING,
    StatementLineClassification.PARTNER_REIMBURSEMENT: JournalEntrySource.PARTNER_REIMBURSEMENT_PAID,
    StatementLineClassification.PARTNER_DRAWING_REPAYMENT: JournalEntrySource.PARTNER_DRAWING_REPAYMENT,
    StatementLineClassification.PARTNER_CAPITAL_CONTRIBUTION: JournalEntrySource.PARTNER_CAPITAL_CONTRIBUTION,
    StatementLineClassification.PARTNER_LOAN_RECEIPT: JournalEntrySource.PARTNER_LOAN_RECEIVED,
    StatementLineClassification.PARTNER_LOAN_PAYMENT: JournalEntrySource.PARTNER_LOAN_REPAID,
    StatementLineClassification.LOAN_PAYMENT: JournalEntrySource.PARTNER_LOAN_REPAID,
    StatementLineClassification.LOAN_RECEIPT: JournalEntrySource.PARTNER_LOAN_RECEIVED,
    StatementLineClassification.POS_SETTLEMENT: JournalEntrySource.POS_SETTLEMENT,
    StatementLineClassification.DELIVERY_SETTLEMENT: JournalEntrySource.DELIVERY_SETTLEMENT,
    StatementLineClassification.TRANSFER: JournalEntrySource.TRANSFER,
}


def load_rule_auto_economic_sources(
    session: Session,
    entry_ids: list[uuid.UUID] | set[uuid.UUID],
) -> dict[uuid.UUID, str]:
    """Map RULE_AUTO journal ids → economic ``JournalEntrySource`` values."""
    ids = list(entry_ids)
    if not ids:
        return {}

    resolved: dict[uuid.UUID, str] = {}

    lines = session.scalars(
        select(BankStatementLine).where(BankStatementLine.journal_entry_id.in_(ids))
    ).all()
    for line in lines:
        if line.journal_entry_id is None:
            continue
        mapped = _CLASSIFICATION_TO_SOURCE.get(line.classification)
        if mapped is not None:
            resolved[line.journal_entry_id] = mapped.value

    drafts = session.scalars(
        select(InvoiceDraft).where(InvoiceDraft.journal_entry_id.in_(ids))
    ).all()
    for draft in drafts:
        if draft.journal_entry_id is None:
            continue
        resolved.setdefault(draft.journal_entry_id, JournalEntrySource.INVOICE.value)

    return resolved


def economic_source_value(
    source: object,
    entry_id: uuid.UUID | None,
    rule_auto_map: dict[uuid.UUID, str],
) -> str:
    """Return the source code partners should see for this journal."""
    raw = source.value if hasattr(source, "value") else str(source or "")
    raw = raw.strip()
    if raw != JournalEntrySource.RULE_AUTO.value:
        return raw
    if entry_id is not None and entry_id in rule_auto_map:
        return rule_auto_map[entry_id]
    return raw
