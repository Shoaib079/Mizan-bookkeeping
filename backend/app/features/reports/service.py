"""Read-only report queries (Phase 7)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import entity_context, require_entity_context
from app.features.delivery.models import DeliveryReport, DeliveryReportStatus, OwnedDeliveryPlatform
from app.features.delivery.settings import require_delivery_enabled
from app.features.entities import service as entity_service
from app.features.reports.schema import DeliverySalesPlatformRow, DeliverySalesReportRead


class InvalidDateRangeError(ValueError):
    """from_date must be on or before to_date."""


def _require_entity(session: Session, entity_id: uuid.UUID) -> None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")


def get_delivery_sales_report(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
) -> DeliverySalesReportRead:
    if from_date > to_date:
        raise InvalidDateRangeError("from must be on or before to")

    _require_entity(session, entity_id)
    require_delivery_enabled(session, entity_id)

    platforms: list[DeliverySalesPlatformRow] = []
    total_gross_kurus = 0

    with entity_context(session, entity_id):
        require_entity_context()

        aggregate_rows = session.execute(
            select(
                DeliveryReport.delivery_platform_id,
                func.coalesce(func.sum(DeliveryReport.gross_kurus), 0),
                func.count(),
            )
            .where(
                DeliveryReport.status == DeliveryReportStatus.POSTED.value,
                DeliveryReport.report_date >= from_date,
                DeliveryReport.report_date <= to_date,
            )
            .group_by(DeliveryReport.delivery_platform_id)
        ).all()
        aggregates_by_platform = {
            platform_id: (int(gross_sum), int(report_count))
            for platform_id, gross_sum, report_count in aggregate_rows
        }

        platform_rows = session.scalars(
            select(OwnedDeliveryPlatform).order_by(OwnedDeliveryPlatform.name)
        ).all()

        for platform in platform_rows:
            gross_kurus, report_count = aggregates_by_platform.get(
                platform.id, (0, 0)
            )
            platforms.append(
                DeliverySalesPlatformRow(
                    delivery_platform_id=platform.id,
                    platform_name=platform.name,
                    is_active=platform.is_active,
                    gross_kurus=gross_kurus,
                    report_count=report_count,
                )
            )
            total_gross_kurus += gross_kurus

    return DeliverySalesReportRead(
        entity_id=entity_id,
        from_date=from_date,
        to_date=to_date,
        platforms=platforms,
        total_gross_kurus=total_gross_kurus,
    )
