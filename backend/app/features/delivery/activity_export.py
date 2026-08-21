"""Presentation assembly for delivery activity downloads."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.features.delivery import excel_export
from app.features.delivery.schema import DeliveryReportRead, DeliverySettlementRead
from app.features.entities import service as entity_service
from app.features.reports.excel_export import export_filename, filename_slug


def build_delivery_activity_export(
    session: Session,
    *,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
    platform_label: str,
    delivery_platform_id: uuid.UUID | None,
    sales: list[DeliveryReportRead],
    settlements: list[DeliverySettlementRead],
) -> tuple[bytes, str]:
    entity = entity_service.get_entity(session, entity_id)
    entity_name = entity.name if entity is not None else "books"
    data = excel_export.build_delivery_activity_xlsx(
        entity_name=entity_name,
        from_date=from_date,
        to_date=to_date,
        platform_label=platform_label,
        sales=sales,
        settlements=settlements,
    )
    report_slug = (
        f"delivery-{filename_slug(platform_label)}"
        if delivery_platform_id
        else "delivery-all-platforms"
    )
    return data, export_filename(
        report_slug,
        entity_name=entity_name,
        from_date=from_date,
        to_date=to_date,
    )
