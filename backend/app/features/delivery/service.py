"""Delivery platform monthly sales — intake, posting, reconciliation (Decisions §9)."""

from __future__ import annotations

import hashlib
import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.delivery.posting import (
    InvalidDeliveryReportError,
    period_end_date,
    post_delivery_report,
    post_delivery_settlement,
)
from app.db.session import entity_context, require_entity_context
from app.core.listing import (
    ListParams,
    amount_range_filters,
    date_range_filters,
    fetch_paginated,
    text_search_filter,
)
from app.features.banking import service as banking_service
from app.features.delivery.models import (
    DeliveryReport,
    DeliveryReportStatus,
    DeliverySettlement,
    OwnedDeliveryPlatform,
)
from app.features.delivery import platform_service
from app.features.delivery.schema import (
    DeliveryClearingReconciliationRead,
    DeliveryReportCreate,
    DeliveryReportPostRequest,
    DeliveryReportRead,
    DeliverySettlementCreate,
    DeliverySettlementRead,
    PlatformClearingReconciliation,
)
from app.features.delivery.settings import require_delivery_enabled
from app.features.entities import service as entity_service
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceKind


class DuplicateDeliveryReportError(Exception):
    def __init__(self, existing: DeliveryReport) -> None:
        self.existing = existing
        super().__init__("Duplicate delivery monthly sales for this entity")


class DeliveryReportImmutableError(Exception):
    """Raised when a posted/rejected report is modified."""


class MonthlySalesAlreadyPostedError(Exception):
    """Raised when a posted entry already exists for platform+period."""


def report_fingerprint(
    *,
    delivery_platform_id: uuid.UUID,
    period_year: int,
    period_month: int,
    gross_kurus: int,
) -> str:
    payload = (
        f"{delivery_platform_id}|{period_year}|{period_month}|{gross_kurus}"
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _require_entity(session: Session, entity_id: uuid.UUID) -> None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")


def _platform_name(session: Session, platform_id: uuid.UUID) -> str:
    platform = session.get(OwnedDeliveryPlatform, platform_id)
    return platform.name if platform is not None else ""


def _to_report_read(session: Session, report: DeliveryReport) -> DeliveryReportRead:
    return DeliveryReportRead(
        id=report.id,
        entity_id=report.entity_id,
        delivery_platform_id=report.delivery_platform_id,
        platform_name=_platform_name(session, report.delivery_platform_id),
        report_date=report.report_date,
        period_year=report.period_year,
        period_month=report.period_month,
        gross_kurus=report.gross_kurus,
        status=report.status,
        file_fingerprint=report.file_fingerprint,
        review_reason=report.review_reason,
        description=report.description,
        actor_id=report.actor_id,
        journal_entry_id=report.journal_entry_id,
        posted_at=report.posted_at,
        posted_by=report.posted_by,
        created_at=report.created_at,
    )


def _to_settlement_read(
    session: Session, settlement: DeliverySettlement
) -> DeliverySettlementRead:
    return DeliverySettlementRead(
        id=settlement.id,
        entity_id=settlement.entity_id,
        delivery_platform_id=settlement.delivery_platform_id,
        platform_name=_platform_name(session, settlement.delivery_platform_id),
        money_account_id=settlement.money_account_id,
        settlement_date=settlement.settlement_date,
        amount_kurus=settlement.amount_kurus,
        description=settlement.description,
        actor_id=settlement.actor_id,
        journal_entry_id=settlement.journal_entry_id,
        reference_type=settlement.reference_type,
        reference_id=settlement.reference_id,
        bank_statement_line_id=settlement.bank_statement_line_id,
        delivery_report_id=settlement.delivery_report_id,
        created_at=settlement.created_at,
    )


def _get_report_row(
    session: Session, entity_id: uuid.UUID, report_id: uuid.UUID
) -> DeliveryReport:
    with entity_context(session, entity_id):
        report = session.get(DeliveryReport, report_id)
        if report is None:
            raise LookupError("Delivery report not found")
        return report


def _posted_for_period_exists(
    session: Session,
    *,
    delivery_platform_id: uuid.UUID,
    period_year: int,
    period_month: int,
    exclude_report_id: uuid.UUID | None = None,
) -> DeliveryReport | None:
    filters = [
        DeliveryReport.delivery_platform_id == delivery_platform_id,
        DeliveryReport.period_year == period_year,
        DeliveryReport.period_month == period_month,
        DeliveryReport.status == DeliveryReportStatus.POSTED.value,
    ]
    if exclude_report_id is not None:
        filters.append(DeliveryReport.id != exclude_report_id)
    return session.scalar(select(DeliveryReport).where(*filters))


def create_delivery_report(
    session: Session,
    entity_id: uuid.UUID,
    payload: DeliveryReportCreate,
) -> DeliveryReportRead:
    _require_entity(session, entity_id)
    platform_service.require_active_delivery_platform(
        session, entity_id, payload.delivery_platform_id
    )

    fingerprint = report_fingerprint(
        delivery_platform_id=payload.delivery_platform_id,
        period_year=payload.period_year,
        period_month=payload.period_month,
        gross_kurus=payload.gross_kurus,
    )

    with entity_context(session, entity_id):
        require_entity_context()

        if _posted_for_period_exists(
            session,
            delivery_platform_id=payload.delivery_platform_id,
            period_year=payload.period_year,
            period_month=payload.period_month,
        ) is not None:
            raise MonthlySalesAlreadyPostedError(
                "Monthly sales already posted for this platform and period"
            )

        existing = session.scalar(
            select(DeliveryReport).where(DeliveryReport.file_fingerprint == fingerprint)
        )
        if existing is not None:
            raise DuplicateDeliveryReportError(existing)

        report_date = period_end_date(
            period_year=payload.period_year,
            period_month=payload.period_month,
        )
        report = DeliveryReport(
            delivery_platform_id=payload.delivery_platform_id,
            report_date=report_date,
            period_year=payload.period_year,
            period_month=payload.period_month,
            gross_kurus=payload.gross_kurus,
            status=DeliveryReportStatus.DRAFT.value,
            file_fingerprint=fingerprint,
            review_reason=None,
            description=payload.description,
        )
        session.add(report)
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            with entity_context(session, entity_id):
                dup = session.scalar(
                    select(DeliveryReport).where(
                        DeliveryReport.file_fingerprint == fingerprint
                    )
                )
                if dup is not None:
                    raise DuplicateDeliveryReportError(dup) from exc
            raise
        session.refresh(report)

    return _to_report_read(session, report)


def post_delivery_report_intake(
    session: Session,
    entity_id: uuid.UUID,
    report_id: uuid.UUID,
    payload: DeliveryReportPostRequest,
) -> DeliveryReportRead:
    _require_entity(session, entity_id)
    report = _get_report_row(session, entity_id, report_id)

    if report.status in (
        DeliveryReportStatus.POSTED.value,
        DeliveryReportStatus.REJECTED.value,
    ):
        raise DeliveryReportImmutableError(
            f"Cannot post report in status {report.status}"
        )

    platform_service.require_active_delivery_platform(
        session, entity_id, report.delivery_platform_id
    )

    with entity_context(session, entity_id):
        if payload.gross_kurus is not None:
            report.gross_kurus = payload.gross_kurus

        if report.gross_kurus <= 0:
            report.status = DeliveryReportStatus.NEEDS_REVIEW.value
            report.review_reason = "gross sales must be positive"
            session.commit()
            session.refresh(report)
            raise InvalidDeliveryReportError(report.review_reason)

        report.status = DeliveryReportStatus.DRAFT.value
        report.review_reason = None
        session.commit()
        session.refresh(report)

    result = post_delivery_report(
        session,
        entity_id,
        report=report,
        actor_id=payload.actor_id,
    )
    return _to_report_read(session, result.delivery_report)


def list_delivery_reports(
    session: Session,
    entity_id: uuid.UUID,
    *,
    delivery_platform_id: uuid.UUID | None = None,
    status: DeliveryReportStatus | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    q: str | None = None,
    min_amount: int | None = None,
    max_amount: int | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[DeliveryReportRead], int]:
    _require_entity(session, entity_id)
    params = list_params or ListParams()

    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if delivery_platform_id is not None:
            filters.append(DeliveryReport.delivery_platform_id == delivery_platform_id)
        if status is not None:
            filters.append(DeliveryReport.status == status.value)
        filters.extend(
            date_range_filters(
                DeliveryReport.report_date, from_date=from_date, to_date=to_date
            )
        )
        filters.extend(
            amount_range_filters(
                DeliveryReport.gross_kurus,
                min_amount=min_amount,
                max_amount=max_amount,
            )
        )
        search = text_search_filter(q, DeliveryReport.description)
        if search is not None:
            filters.append(search)
        stmt = (
            select(DeliveryReport)
            .where(*filters)
            .order_by(
                DeliveryReport.period_year.desc(),
                DeliveryReport.period_month.desc(),
                DeliveryReport.created_at.desc(),
            )
        )
        reports, total = fetch_paginated(session, stmt, params)
        return [_to_report_read(session, report) for report in reports], total


def get_delivery_report(
    session: Session,
    entity_id: uuid.UUID,
    report_id: uuid.UUID,
) -> DeliveryReportRead:
    report = _get_report_row(session, entity_id, report_id)
    return _to_report_read(session, report)


def reject_delivery_report(
    session: Session,
    entity_id: uuid.UUID,
    report_id: uuid.UUID,
    *,
    reason: str | None = None,
) -> DeliveryReportRead:
    _require_entity(session, entity_id)
    report = _get_report_row(session, entity_id, report_id)

    if report.status in (
        DeliveryReportStatus.POSTED.value,
        DeliveryReportStatus.REJECTED.value,
    ):
        raise DeliveryReportImmutableError(
            f"Cannot reject report in status {report.status}"
        )

    with entity_context(session, entity_id):
        report.status = DeliveryReportStatus.REJECTED.value
        report.review_reason = reason
        session.commit()
        session.refresh(report)

    return _to_report_read(session, report)


def create_delivery_settlement(
    session: Session,
    entity_id: uuid.UUID,
    payload: DeliverySettlementCreate,
) -> DeliverySettlementRead:
    _require_entity(session, entity_id)
    platform_service.require_active_delivery_platform(
        session, entity_id, payload.delivery_platform_id
    )

    result = post_delivery_settlement(
        session,
        entity_id,
        delivery_platform_id=payload.delivery_platform_id,
        money_account_id=payload.money_account_id,
        settlement_date=payload.settlement_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        delivery_report_id=payload.delivery_report_id,
    )
    return _to_settlement_read(session, result.delivery_settlement)


def list_delivery_settlements(
    session: Session,
    entity_id: uuid.UUID,
    *,
    delivery_platform_id: uuid.UUID | None = None,
    money_account_id: uuid.UUID | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    min_amount: int | None = None,
    max_amount: int | None = None,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[DeliverySettlementRead], int]:
    _require_entity(session, entity_id)
    params = list_params or ListParams()

    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if delivery_platform_id is not None:
            filters.append(DeliverySettlement.delivery_platform_id == delivery_platform_id)
        if money_account_id is not None:
            filters.append(DeliverySettlement.money_account_id == money_account_id)
        filters.extend(
            date_range_filters(
                DeliverySettlement.settlement_date,
                from_date=from_date,
                to_date=to_date,
            )
        )
        filters.extend(
            amount_range_filters(
                DeliverySettlement.amount_kurus,
                min_amount=min_amount,
                max_amount=max_amount,
            )
        )
        search = text_search_filter(q, DeliverySettlement.description)
        if search is not None:
            filters.append(search)
        stmt = (
            select(DeliverySettlement)
            .where(*filters)
            .order_by(
                DeliverySettlement.settlement_date.desc(),
                DeliverySettlement.created_at.desc(),
            )
        )
        settlements, total = fetch_paginated(session, stmt, params)
        return [_to_settlement_read(session, s) for s in settlements], total


def get_delivery_clearing_reconciliation(
    session: Session,
    entity_id: uuid.UUID,
) -> DeliveryClearingReconciliationRead:
    _require_entity(session, entity_id)
    require_delivery_enabled(session, entity_id)

    platforms: list[PlatformClearingReconciliation] = []

    with entity_context(session, entity_id):
        require_entity_context()

        rows = session.execute(
            select(OwnedDeliveryPlatform, Account).join(
                Account, OwnedDeliveryPlatform.gl_account_id == Account.id
            ).order_by(OwnedDeliveryPlatform.name)
        ).all()

        for platform, clearing_account in rows:
            clearing_balance_kurus = banking_service.gl_balance_kurus(
                session,
                clearing_account.id,
                AccountNormalBalance.DEBIT,
            )

            total_reported_gross_kurus = int(
                session.scalar(
                    select(func.coalesce(func.sum(DeliveryReport.gross_kurus), 0)).where(
                        DeliveryReport.delivery_platform_id == platform.id,
                        DeliveryReport.status == DeliveryReportStatus.POSTED.value,
                    )
                )
                or 0
            )
            monthly_sales_count = int(
                session.scalar(
                    select(func.count())
                    .select_from(DeliveryReport)
                    .where(
                        DeliveryReport.delivery_platform_id == platform.id,
                        DeliveryReport.status == DeliveryReportStatus.POSTED.value,
                    )
                )
                or 0
            )

            total_settled_net_kurus = int(
                session.scalar(
                    select(func.coalesce(func.sum(DeliverySettlement.amount_kurus), 0)).where(
                        DeliverySettlement.delivery_platform_id == platform.id
                    )
                )
                or 0
            )
            settlement_count = int(
                session.scalar(
                    select(func.count())
                    .select_from(DeliverySettlement)
                    .where(DeliverySettlement.delivery_platform_id == platform.id)
                )
                or 0
            )

            total_commission_posted_kurus = int(
                session.scalar(
                    select(func.coalesce(func.sum(InvoiceDraft.gross_kurus), 0)).where(
                        InvoiceDraft.delivery_platform_id == platform.id,
                        InvoiceDraft.invoice_kind == InvoiceKind.DELIVERY_COMMISSION.value,
                        InvoiceDraft.status == InvoiceDraftStatus.POSTED.value,
                    )
                )
                or 0
            )
            commission_posted_count = int(
                session.scalar(
                    select(func.count())
                    .select_from(InvoiceDraft)
                    .where(
                        InvoiceDraft.delivery_platform_id == platform.id,
                        InvoiceDraft.invoice_kind == InvoiceKind.DELIVERY_COMMISSION.value,
                        InvoiceDraft.status == InvoiceDraftStatus.POSTED.value,
                    )
                )
                or 0
            )

            balance_left_kurus = (
                total_reported_gross_kurus
                - total_settled_net_kurus
                - total_commission_posted_kurus
            )

            platforms.append(
                PlatformClearingReconciliation(
                    delivery_platform_id=platform.id,
                    platform_name=platform.name,
                    clearing_account_code=clearing_account.code,
                    is_active=platform.is_active,
                    clearing_balance_kurus=clearing_balance_kurus,
                    total_reported_gross_kurus=total_reported_gross_kurus,
                    total_settled_net_kurus=total_settled_net_kurus,
                    total_commission_posted_kurus=total_commission_posted_kurus,
                    balance_left_kurus=balance_left_kurus,
                    monthly_sales_count=monthly_sales_count,
                    settlement_count=settlement_count,
                    commission_posted_count=commission_posted_count,
                )
            )

    return DeliveryClearingReconciliationRead(platforms=platforms)
