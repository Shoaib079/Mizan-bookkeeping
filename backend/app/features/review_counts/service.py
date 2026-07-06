"""Review queue counts aligned with Review hub tab filters."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import entity_context, require_entity_context
from app.features.banking.statement_models import BankStatementLine, StatementLineStatus
from app.features.delivery.models import DeliveryReport, DeliveryReportStatus
from app.features.delivery.settings import is_delivery_enabled
from app.features.entities import service as entity_service
from app.features.expenses.models import (
    ExpenseEntry,
    ExpenseEntryStatus,
    ExpenseReceiptIntake,
    ExpenseReceiptIntakeStatus,
)
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus
from app.features.pos.models import PosDailySummary, PosDailySummaryStatus
from app.features.review_counts.schema import ReviewCountsRead, ReviewTabCounts

_PENDING_INVOICE_STATUSES = (
    InvoiceDraftStatus.DRAFT.value,
    InvoiceDraftStatus.NEEDS_REVIEW.value,
    InvoiceDraftStatus.DUPLICATE.value,
)
_PENDING_RECEIPT_STATUSES = (
    ExpenseReceiptIntakeStatus.DRAFT.value,
    ExpenseReceiptIntakeStatus.NEEDS_REVIEW.value,
)
_PENDING_POS_STATUSES = (
    PosDailySummaryStatus.DRAFT.value,
    PosDailySummaryStatus.NEEDS_REVIEW.value,
)
_PENDING_DELIVERY_STATUSES = (
    DeliveryReportStatus.DRAFT.value,
    DeliveryReportStatus.NEEDS_REVIEW.value,
)


def _scalar_count(session: Session, stmt) -> int:
    return int(session.scalar(stmt) or 0)


def get_review_counts(session: Session, entity_id: uuid.UUID) -> ReviewCountsRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    delivery_enabled = is_delivery_enabled(session, entity_id)

    with entity_context(session, entity_id):
        require_entity_context()

        bank = _scalar_count(
            session,
            select(func.count())
            .select_from(BankStatementLine)
            .where(BankStatementLine.status == StatementLineStatus.NEEDS_REVIEW),
        )
        sales = _scalar_count(
            session,
            select(func.count())
            .select_from(PosDailySummary)
            .where(PosDailySummary.status.in_(_PENDING_POS_STATUSES)),
        )
        receipts = _scalar_count(
            session,
            select(func.count())
            .select_from(ExpenseReceiptIntake)
            .where(ExpenseReceiptIntake.status.in_(_PENDING_RECEIPT_STATUSES)),
        )
        invoices_pending = _scalar_count(
            session,
            select(func.count())
            .select_from(InvoiceDraft)
            .where(InvoiceDraft.status.in_(_PENDING_INVOICE_STATUSES)),
        )
        invoices_ready = _scalar_count(
            session,
            select(func.count())
            .select_from(InvoiceDraft)
            .where(InvoiceDraft.status == InvoiceDraftStatus.CONFIRMED.value),
        )
        expenses = _scalar_count(
            session,
            select(func.count())
            .select_from(ExpenseEntry)
            .where(ExpenseEntry.status == ExpenseEntryStatus.NEEDS_REVIEW),
        )
        delivery = 0
        if delivery_enabled:
            delivery = _scalar_count(
                session,
                select(func.count())
                .select_from(DeliveryReport)
                .where(DeliveryReport.status.in_(_PENDING_DELIVERY_STATUSES)),
            )

    by_tab = ReviewTabCounts(
        bank=bank,
        sales=sales,
        receipts=receipts,
        invoices=invoices_pending + invoices_ready,
        expenses=expenses,
        delivery=delivery,
    )
    total = bank + sales + receipts + invoices_pending + invoices_ready + expenses + delivery
    return ReviewCountsRead(
        total=total,
        by_tab=by_tab,
        invoices_pending=invoices_pending,
        invoices_ready_to_post=invoices_ready,
    )
