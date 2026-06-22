"""Delivery platform reports — intake, posting, reconciliation (Decisions §9)."""

from __future__ import annotations

import hashlib
import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.delivery.platforms import (
    DeliveryPlatform,
    PLATFORM_CLEARING_CODES,
    clearing_code_for_platform,
)
from app.core.delivery.posting import (
    InvalidDeliveryReportError,
    post_delivery_report,
    post_delivery_settlement,
    report_math_valid,
)
from app.db.session import entity_context, require_entity_context
from app.features.banking import service as banking_service
from app.features.delivery.models import (
    DeliveryReport,
    DeliveryReportStatus,
    DeliverySettlement,
)
from app.features.delivery.schema import (
    DeliveryClearingReconciliationRead,
    DeliveryReportCreate,
    DeliveryReportListOut,
    DeliveryReportPostRequest,
    DeliveryReportRead,
    DeliverySettlementCreate,
    DeliverySettlementRead,
    PlatformClearingReconciliation,
)
from app.features.delivery.settings import (
    DeliveryNotEnabledError,
    DeliveryPlatformNotEnabledError,
    require_delivery_enabled,
    require_platform_enabled,
)
from app.features.entities import service as entity_service


class DuplicateDeliveryReportError(Exception):
    def __init__(self, existing: DeliveryReport) -> None:
        self.existing = existing
        super().__init__("Duplicate delivery report for this entity")


class DeliveryReportImmutableError(Exception):
    """Raised when a posted/rejected report is modified."""


def report_fingerprint(
    *,
    platform: DeliveryPlatform,
    report_date,
    gross_kurus: int,
    commission_kurus: int,
    net_kurus: int,
) -> str:
    payload = (
        f"{platform.value}|{report_date.isoformat()}|"
        f"{gross_kurus}|{commission_kurus}|{net_kurus}"
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _require_entity(session: Session, entity_id: uuid.UUID) -> None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")


def _to_report_read(report: DeliveryReport) -> DeliveryReportRead:
    return DeliveryReportRead(
        id=report.id,
        entity_id=report.entity_id,
        platform=DeliveryPlatform(report.platform),
        report_date=report.report_date,
        gross_kurus=report.gross_kurus,
        commission_kurus=report.commission_kurus,
        net_kurus=report.net_kurus,
        status=report.status,
        file_fingerprint=report.file_fingerprint,
        review_reason=report.review_reason,
        description=report.description,
        actor_id=report.actor_id,
        journal_entry_id=report.journal_entry_id,
        commission_journal_entry_id=report.commission_journal_entry_id,
        posted_at=report.posted_at,
        posted_by=report.posted_by,
        created_at=report.created_at,
    )


def _to_settlement_read(settlement: DeliverySettlement) -> DeliverySettlementRead:
    return DeliverySettlementRead(
        id=settlement.id,
        entity_id=settlement.entity_id,
        platform=DeliveryPlatform(settlement.platform),
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


def create_delivery_report(
    session: Session,
    entity_id: uuid.UUID,
    payload: DeliveryReportCreate,
) -> DeliveryReportRead:
    _require_entity(session, entity_id)
    require_platform_enabled(session, entity_id, payload.platform)

    fingerprint = report_fingerprint(
        platform=payload.platform,
        report_date=payload.report_date,
        gross_kurus=payload.gross_kurus,
        commission_kurus=payload.commission_kurus,
        net_kurus=payload.net_kurus,
    )

    math_ok = report_math_valid(
        gross_kurus=payload.gross_kurus,
        commission_kurus=payload.commission_kurus,
        net_kurus=payload.net_kurus,
    )
    if math_ok:
        status = DeliveryReportStatus.DRAFT
        review_reason = None
    else:
        status = DeliveryReportStatus.NEEDS_REVIEW
        review_reason = (
            f"gross ({payload.gross_kurus}) - commission ({payload.commission_kurus}) "
            f"!= net ({payload.net_kurus})"
        )

    with entity_context(session, entity_id):
        require_entity_context()
        existing = session.scalar(
            select(DeliveryReport).where(DeliveryReport.file_fingerprint == fingerprint)
        )
        if existing is not None:
            raise DuplicateDeliveryReportError(existing)

        report = DeliveryReport(
            platform=payload.platform.value,
            report_date=payload.report_date,
            gross_kurus=payload.gross_kurus,
            commission_kurus=payload.commission_kurus,
            net_kurus=payload.net_kurus,
            status=status.value,
            file_fingerprint=fingerprint,
            review_reason=review_reason,
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

    return _to_report_read(report)


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

    platform = DeliveryPlatform(report.platform)
    require_platform_enabled(session, entity_id, platform)

    with entity_context(session, entity_id):
        if payload.gross_kurus is not None:
            report.gross_kurus = payload.gross_kurus
        if payload.commission_kurus is not None:
            report.commission_kurus = payload.commission_kurus
        if payload.net_kurus is not None:
            report.net_kurus = payload.net_kurus

        if not report_math_valid(
            gross_kurus=report.gross_kurus,
            commission_kurus=report.commission_kurus,
            net_kurus=report.net_kurus,
        ):
            report.status = DeliveryReportStatus.NEEDS_REVIEW.value
            report.review_reason = (
                f"gross ({report.gross_kurus}) - commission ({report.commission_kurus}) "
                f"!= net ({report.net_kurus})"
            )
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
    return _to_report_read(result.delivery_report)


def list_delivery_reports(
    session: Session,
    entity_id: uuid.UUID,
    *,
    platform: DeliveryPlatform | None = None,
    status: DeliveryReportStatus | None = None,
) -> DeliveryReportListOut:
    _require_entity(session, entity_id)

    with entity_context(session, entity_id):
        require_entity_context()
        query = select(DeliveryReport).order_by(
            DeliveryReport.report_date.desc(),
            DeliveryReport.created_at.desc(),
        )
        if platform is not None:
            query = query.where(DeliveryReport.platform == platform.value)
        if status is not None:
            query = query.where(DeliveryReport.status == status.value)
        reports = session.scalars(query).all()
        items = [_to_report_read(report) for report in reports]
        return DeliveryReportListOut(items=items, total=len(items))


def get_delivery_report(
    session: Session,
    entity_id: uuid.UUID,
    report_id: uuid.UUID,
) -> DeliveryReportRead:
    report = _get_report_row(session, entity_id, report_id)
    return _to_report_read(report)


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

    return _to_report_read(report)


def create_delivery_settlement(
    session: Session,
    entity_id: uuid.UUID,
    payload: DeliverySettlementCreate,
) -> DeliverySettlementRead:
    _require_entity(session, entity_id)
    require_platform_enabled(session, entity_id, payload.platform)

    result = post_delivery_settlement(
        session,
        entity_id,
        platform=payload.platform,
        money_account_id=payload.money_account_id,
        settlement_date=payload.settlement_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        delivery_report_id=payload.delivery_report_id,
    )
    return _to_settlement_read(result.delivery_settlement)


def list_delivery_settlements(
    session: Session,
    entity_id: uuid.UUID,
    *,
    platform: DeliveryPlatform | None = None,
    money_account_id: uuid.UUID | None = None,
) -> list[DeliverySettlementRead]:
    _require_entity(session, entity_id)

    with entity_context(session, entity_id):
        require_entity_context()
        query = select(DeliverySettlement).order_by(
            DeliverySettlement.settlement_date.desc(),
            DeliverySettlement.created_at.desc(),
        )
        if platform is not None:
            query = query.where(DeliverySettlement.platform == platform.value)
        if money_account_id is not None:
            query = query.where(DeliverySettlement.money_account_id == money_account_id)
        settlements = session.scalars(query).all()
        return [_to_settlement_read(settlement) for settlement in settlements]


def get_delivery_clearing_reconciliation(
    session: Session,
    entity_id: uuid.UUID,
) -> DeliveryClearingReconciliationRead:
    _require_entity(session, entity_id)
    require_delivery_enabled(session, entity_id)

    platforms: list[PlatformClearingReconciliation] = []

    with entity_context(session, entity_id):
        require_entity_context()

        for platform, clearing_code in PLATFORM_CLEARING_CODES.items():
            clearing_account = session.scalar(
                select(Account).where(Account.code == clearing_code)
            )
            if clearing_account is None:
                continue

            clearing_balance_kurus = banking_service.gl_balance_kurus(
                session,
                clearing_account.id,
                AccountNormalBalance.DEBIT,
            )

            total_reported_gross_kurus = int(
                session.scalar(
                    select(func.coalesce(func.sum(DeliveryReport.gross_kurus), 0)).where(
                        DeliveryReport.platform == platform.value,
                        DeliveryReport.status == DeliveryReportStatus.POSTED.value,
                    )
                )
                or 0
            )
            report_count = int(
                session.scalar(
                    select(func.count())
                    .select_from(DeliveryReport)
                    .where(
                        DeliveryReport.platform == platform.value,
                        DeliveryReport.status == DeliveryReportStatus.POSTED.value,
                    )
                )
                or 0
            )

            total_settled_net_kurus = int(
                session.scalar(
                    select(func.coalesce(func.sum(DeliverySettlement.amount_kurus), 0)).where(
                        DeliverySettlement.platform == platform.value
                    )
                )
                or 0
            )
            settlement_count = int(
                session.scalar(
                    select(func.count())
                    .select_from(DeliverySettlement)
                    .where(DeliverySettlement.platform == platform.value)
                )
                or 0
            )

            total_commission_posted_kurus = int(
                session.scalar(
                    select(
                        func.coalesce(func.sum(DeliveryReport.commission_kurus), 0)
                    ).where(
                        DeliveryReport.platform == platform.value,
                        DeliveryReport.status == DeliveryReportStatus.POSTED.value,
                        DeliveryReport.commission_journal_entry_id.is_not(None),
                    )
                )
                or 0
            )
            commission_posted_count = int(
                session.scalar(
                    select(func.count())
                    .select_from(DeliveryReport)
                    .where(
                        DeliveryReport.platform == platform.value,
                        DeliveryReport.status == DeliveryReportStatus.POSTED.value,
                        DeliveryReport.commission_journal_entry_id.is_not(None),
                    )
                )
                or 0
            )

            in_transit_kurus = (
                total_reported_gross_kurus
                - total_settled_net_kurus
                - total_commission_posted_kurus
            )

            platforms.append(
                PlatformClearingReconciliation(
                    platform=platform,
                    clearing_account_code=clearing_code,
                    clearing_balance_kurus=clearing_balance_kurus,
                    total_reported_gross_kurus=total_reported_gross_kurus,
                    total_settled_net_kurus=total_settled_net_kurus,
                    total_commission_posted_kurus=total_commission_posted_kurus,
                    in_transit_kurus=in_transit_kurus,
                    report_count=report_count,
                    settlement_count=settlement_count,
                    commission_posted_count=commission_posted_count,
                )
            )

    return DeliveryClearingReconciliationRead(platforms=platforms)
