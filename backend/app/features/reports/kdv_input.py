"""Per-rate input KDV report (Phase 7 Slice 5)."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceKind
from app.features.reports.schema import KdvInputRateRow, KdvInputReportRead
from app.features.reports.service import InvalidDateRangeError

__all__ = ["get_kdv_input_report"]


def _require_entity(session: Session, entity_id: uuid.UUID) -> None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")


def _normalize_rate(rate_percent: object) -> float:
    return float(rate_percent)


def get_kdv_input_report(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
) -> KdvInputReportRead:
    if from_date > to_date:
        raise InvalidDateRangeError("from must be on or before to")

    _require_entity(session, entity_id)

    rate_base: dict[float, int] = defaultdict(int)
    rate_vat: dict[float, int] = defaultdict(int)
    rate_invoice_ids: dict[float, set[uuid.UUID]] = defaultdict(set)
    all_invoice_ids: set[uuid.UUID] = set()

    with entity_context(session, entity_id):
        require_entity_context()

        drafts = session.scalars(
            select(InvoiceDraft)
            .where(
                InvoiceDraft.status == InvoiceDraftStatus.POSTED.value,
                InvoiceDraft.invoice_kind.in_(
                    (
                        InvoiceKind.SUPPLIER.value,
                        InvoiceKind.SUPPLIER_CREDIT.value,
                        InvoiceKind.DELIVERY_COMMISSION.value,
                    )
                ),
                InvoiceDraft.invoice_date >= from_date,
                InvoiceDraft.invoice_date <= to_date,
            )
            .order_by(InvoiceDraft.invoice_date, InvoiceDraft.id)
        ).all()

        for draft in drafts:
            all_invoice_ids.add(draft.id)
            sign = (
                -1
                if InvoiceKind(draft.invoice_kind) == InvoiceKind.SUPPLIER_CREDIT
                else 1
            )
            for entry in draft.vat_breakdown:
                rate = _normalize_rate(entry["rate_percent"])
                rate_base[rate] += sign * int(entry["base_kurus"])
                rate_vat[rate] += sign * int(entry["vat_kurus"])
                rate_invoice_ids[rate].add(draft.id)

    rates = [
        KdvInputRateRow(
            rate_percent=rate,
            base_kurus=rate_base[rate],
            vat_kurus=rate_vat[rate],
            invoice_count=len(rate_invoice_ids[rate]),
        )
        for rate in sorted(rate_base.keys())
    ]

    return KdvInputReportRead(
        entity_id=entity_id,
        from_date=from_date,
        to_date=to_date,
        rates=rates,
        total_base_kurus=sum(row.base_kurus for row in rates),
        total_vat_kurus=sum(row.vat_kurus for row in rates),
        invoice_count=len(all_invoice_ids),
    )
