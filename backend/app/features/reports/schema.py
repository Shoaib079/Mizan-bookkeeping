"""Pydantic models for read-only reports."""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict


class DeliverySalesPlatformRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    delivery_platform_id: uuid.UUID
    platform_name: str
    is_active: bool
    gross_kurus: int
    report_count: int


class DeliverySalesReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entity_id: uuid.UUID
    from_date: date
    to_date: date
    platforms: list[DeliverySalesPlatformRow]
    total_gross_kurus: int
